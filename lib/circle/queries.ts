import { createAdminClient } from '@/lib/supabase/admin'
import { looksLikeToken } from '@/lib/security/link-token'

/**
 * Leer el círculo.
 *
 * Igual que en la votación, aquí se usa el service role y por tanto cada
 * consulta tiene que ganarse el derecho a existir. La razón de necesitarlo es
 * pequeña y concreta: **los nombres**. `profiles` solo deja leer la fila propia
 * —y así debe seguir—, así que para poder escribir «Marta» en vez de un
 * identificador hay que pedirlo por encima de RLS.
 *
 * Por eso este módulo devuelve exclusivamente nombre e identificador de gente
 * que ya está en el círculo de quien pregunta. Nunca correos, nunca búsqueda
 * por nombre, nunca a nadie de fuera. Una función que permitiera buscar
 * usuarios por nombre convertiría esta tabla en un directorio, que es
 * precisamente lo que una aplicación de fotos de ropa no debe tener.
 */

export interface CircleMember {
  id: string
  name: string
  /** Lo que YO le dejo ver. `null` si no le he dado nada. */
  iGive: 'view' | 'style' | null
  /** Lo que ELLA me deja ver a mí. Solo informativo. */
  theyGive: 'view' | 'style' | null
  since: string
}

const ANON = 'Alguien'

export async function listCircle(userId: string): Promise<CircleMember[]> {
  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from('connections')
    .select('friend_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  const rows = (links ?? []) as { friend_id: string; created_at: string }[]
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.friend_id)

  const [{ data: profiles }, { data: mine }, { data: theirs }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', ids),
    // Lo que doy.
    supabase.from('wardrobe_grants').select('viewer_id, level').eq('owner_id', userId),
    // Lo que me dan.
    supabase.from('wardrobe_grants').select('owner_id, level').eq('viewer_id', userId),
  ])

  const names = new Map<string, string>()
  for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    names.set(row.id, row.display_name?.trim() || ANON)
  }

  const given = new Map<string, 'view' | 'style'>()
  for (const row of (mine ?? []) as { viewer_id: string; level: 'view' | 'style' }[]) {
    given.set(row.viewer_id, row.level)
  }

  const received = new Map<string, 'view' | 'style'>()
  for (const row of (theirs ?? []) as { owner_id: string; level: 'view' | 'style' }[]) {
    received.set(row.owner_id, row.level)
  }

  return rows.map((row) => ({
    id: row.friend_id,
    name: names.get(row.friend_id) ?? ANON,
    iGive: given.get(row.friend_id) ?? null,
    theyGive: received.get(row.friend_id) ?? null,
    since: row.created_at,
  }))
}

export interface InviteView {
  token: string
  inviterId: string
  inviterName: string
  /** Ya se ha usado, ha caducado, o quien mira ya está dentro. */
  state: 'open' | 'spent' | 'expired' | 'already' | 'own'
}

/**
 * Leer una invitación por su enlace.
 *
 * Devuelve siempre algo cuando el token existe, aunque ya no sirva: quien abre
 * un enlace caducado merece leer «esta invitación ya se ha usado» y no un 404
 * que le haga pensar que se ha equivocado al copiarlo.
 */
export async function loadInvite(
  token: string,
  viewerId: string | null,
): Promise<InviteView | null> {
  if (!looksLikeToken(token)) return null

  const supabase = createAdminClient()

  const { data } = await supabase
    .from('circle_invites')
    .select('token, inviter_id, used_by, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!data) return null
  const invite = data as {
    token: string
    inviter_id: string
    used_by: string | null
    expires_at: string
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', invite.inviter_id)
    .maybeSingle()

  const name = (profile as { display_name: string | null } | null)?.display_name?.trim() || ANON

  let state: InviteView['state'] = 'open'

  if (viewerId && viewerId === invite.inviter_id) state = 'own'
  else if (invite.used_by) state = 'spent'
  else if (new Date(invite.expires_at).getTime() <= Date.now()) state = 'expired'
  else if (viewerId) {
    const { data: existing } = await supabase
      .from('connections')
      .select('id')
      .eq('user_id', viewerId)
      .eq('friend_id', invite.inviter_id)
      .maybeSingle()
    if (existing) state = 'already'
  }

  return { token: invite.token, inviterId: invite.inviter_id, inviterName: name, state }
}
