import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment } from '@/lib/wardrobe/labels'

/**
 * El duelo de armarios, a ciegas.
 *
 * Dos personas, una ocasión, un look cada una montado por el motor, y el
 * círculo vota sin saber de quién es cada uno. Los nombres salen al votar.
 *
 * **Lo ciego es de verdad**: mientras no has votado, este módulo no devuelve
 * los nombres. No se esconden en la pantalla —se quedan en el servidor—, que es
 * la diferencia entre un juego a ciegas y un juego que se rompe mirando el
 * código fuente.
 */

export interface DuelGarment {
  id: string
  label: string
  imageUrl: string | null
}

export interface DuelSide {
  side: 'a' | 'b'
  garments: DuelGarment[]
  votes: number
  /** Solo cuando ya se puede saber: has votado, es tuyo, o se ha cerrado. */
  name: string | null
}

export interface DuelView {
  id: string
  occasion: string
  status: 'pending' | 'open' | 'declined' | 'closed'
  /** Quién reta. Se sabe siempre: el reto te llega con nombre. */
  challengerName: string
  opponentName: string
  amChallenger: boolean
  amOpponent: boolean
  /** Ya has votado, o no puedes porque eres parte del duelo. */
  myVote: 'a' | 'b' | null
  revealed: boolean
  sides: DuelSide[]
  closesAt: string | null
}

const ANON = 'Alguien'
const PHOTO_EXPIRY_SECONDS = 1800

export async function getDuel(duelId: string, viewerId: string): Promise<DuelView | null> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('duels')
    .select(
      'id, challenger_id, opponent_id, occasion, status, challenger_outfit_id, opponent_outfit_id, closes_at',
    )
    .eq('id', duelId)
    .maybeSingle()

  if (!data) return null

  const duel = data as {
    id: string
    challenger_id: string
    opponent_id: string
    occasion: string
    status: DuelView['status']
    challenger_outfit_id: string | null
    opponent_outfit_id: string | null
    closes_at: string | null
  }

  /*
   * Quién puede mirar: los dos duelistas, o alguien del círculo de cualquiera
   * de las dos. Es la misma regla que la política de la tabla, repetida aquí
   * porque a partir de este punto se usa el service role.
   */
  const { data: links } = await supabase
    .from('connections')
    .select('user_id')
    .eq('friend_id', viewerId)
    .in('user_id', [duel.challenger_id, duel.opponent_id])

  const isParty = viewerId === duel.challenger_id || viewerId === duel.opponent_id
  if (!isParty && (links ?? []).length === 0) return null

  const [{ data: profiles }, { data: votes }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', [duel.challenger_id, duel.opponent_id]),
    supabase.from('duel_votes').select('voter_id, side').eq('duel_id', duel.id),
  ])

  const names = new Map<string, string>()
  for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    names.set(row.id, row.display_name?.trim() || ANON)
  }

  const allVotes = (votes ?? []) as { voter_id: string; side: 'a' | 'b' }[]
  const myVote = allVotes.find((v) => v.voter_id === viewerId)?.side ?? null

  // Se destapa al votar, si eres parte, o cuando ya ha terminado.
  const revealed = Boolean(myVote) || isParty || duel.status === 'closed'

  const garments = await loadSides(supabase, [
    duel.challenger_outfit_id,
    duel.opponent_outfit_id,
  ])

  const sides: DuelSide[] = [
    {
      side: 'a',
      garments: garments.get(duel.challenger_outfit_id ?? '') ?? [],
      votes: allVotes.filter((v) => v.side === 'a').length,
      name: revealed ? (names.get(duel.challenger_id) ?? ANON) : null,
    },
    {
      side: 'b',
      garments: garments.get(duel.opponent_outfit_id ?? '') ?? [],
      votes: allVotes.filter((v) => v.side === 'b').length,
      name: revealed ? (names.get(duel.opponent_id) ?? ANON) : null,
    },
  ]

  return {
    id: duel.id,
    occasion: duel.occasion,
    status: duel.status,
    challengerName: names.get(duel.challenger_id) ?? ANON,
    opponentName: names.get(duel.opponent_id) ?? ANON,
    amChallenger: viewerId === duel.challenger_id,
    amOpponent: viewerId === duel.opponent_id,
    myVote,
    revealed,
    sides,
    closesAt: duel.closes_at,
  }
}

async function loadSides(
  supabase: ReturnType<typeof createAdminClient>,
  outfitIds: readonly (string | null)[],
): Promise<Map<string, DuelGarment[]>> {
  const ids = outfitIds.filter((id): id is string => Boolean(id))
  const out = new Map<string, DuelGarment[]>()
  if (ids.length === 0) return out

  const { data } = await supabase
    .from('outfit_items')
    .select('outfit_id, clothing_items(id, category, primary_color, fit, pattern, image_path)')
    .in('outfit_id', ids)

  type Garment = {
    id: string
    category: string
    primary_color: string
    fit: string | null
    pattern: string | null
    image_path: string | null
  }

  const rows = (data ?? []) as unknown as { outfit_id: string; clothing_items: Garment | null }[]

  const paths = rows
    .map((row) => row.clothing_items?.image_path)
    .filter((p): p is string => Boolean(p))

  const signed =
    paths.length > 0
      ? await supabase.storage.from(BUCKETS.clothing).createSignedUrls(paths, PHOTO_EXPIRY_SECONDS)
      : { data: [] }

  const urls = new Map<string, string>()
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }

  for (const id of ids) {
    out.set(
      id,
      rows
        .filter((row) => row.outfit_id === id && row.clothing_items)
        .map((row) => {
          const garment = row.clothing_items!
          return {
            id: garment.id,
            label: describeGarment(garment),
            imageUrl: garment.image_path ? (urls.get(garment.image_path) ?? null) : null,
          }
        }),
    )
  }

  return out
}

/** Los duelos vivos de alguien: los que le tocan contestar y los que puede votar. */
export interface DuelSummary {
  id: string
  occasion: string
  status: DuelView['status']
  /** Te están retando y no has contestado. */
  needsAnswer: boolean
  otherName: string
}

export async function listDuels(userId: string): Promise<DuelSummary[]> {
  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from('connections')
    .select('friend_id')
    .eq('user_id', userId)

  const friends = ((links ?? []) as { friend_id: string }[]).map((l) => l.friend_id)
  const people = [...new Set([userId, ...friends])]

  const { data } = await supabase
    .from('duels')
    .select('id, challenger_id, opponent_id, occasion, status')
    .or(`challenger_id.in.(${people.join(',')}),opponent_id.in.(${people.join(',')})`)
    .in('status', ['pending', 'open'])
    .order('created_at', { ascending: false })
    .limit(10)

  const rows = (data ?? []) as {
    id: string
    challenger_id: string
    opponent_id: string
    occasion: string
    status: DuelView['status']
  }[]

  if (rows.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [...new Set(rows.flatMap((r) => [r.challenger_id, r.opponent_id]))])

  const names = new Map<string, string>()
  for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    names.set(row.id, row.display_name?.trim() || ANON)
  }

  return rows.map((row) => ({
    id: row.id,
    occasion: row.occasion,
    status: row.status,
    needsAnswer: row.opponent_id === userId && row.status === 'pending',
    otherName:
      names.get(row.challenger_id === userId ? row.opponent_id : row.challenger_id) ?? ANON,
  }))
}
