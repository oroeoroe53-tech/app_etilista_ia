import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment } from '@/lib/wardrobe/labels'
import { explainFromHighlights } from '@/lib/outfits/name'

/**
 * Lo que se ha puesto hoy tu círculo.
 *
 * Es un feed, pero conviene decir qué clase de feed: **no hay descubrimiento,
 * no hay gente desconocida y no hay orden por interés**. Son las personas que
 * tú has metido en tu círculo, por fecha, y se acaban. Una pantalla que se
 * termina es lo contrario de lo que hacen las aplicaciones que queremos que
 * esta no sea.
 *
 * Tampoco hay «me gusta», ni contador de nada. Lo que se puede hacer con lo que
 * ves es pedir la prenda prestada, que es lo único que cambia algo en la vida
 * real de alguien.
 */

export interface FeedGarment {
  id: string
  label: string
  imageUrl: string | null
}

export interface FeedEntry {
  id: string
  userId: string
  name: string
  /** Es tuya: se puede quitar. */
  isMine: boolean
  sharedOn: string
  note: string | null
  lookName: string | null
  why: string | null
  garments: FeedGarment[]
  /** Te deja ver su armario, así que sus prendas se pueden abrir y pedir. */
  canBorrow: boolean
}

const ANON = 'Alguien'
const PHOTO_EXPIRY_SECONDS = 1800

/** Dos semanas. Más atrás no es un feed, es un archivo que nadie mira. */
const DAYS = 14

export async function listFeed(userId: string): Promise<FeedEntry[]> {
  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from('connections')
    .select('friend_id')
    .eq('user_id', userId)

  const friends = ((links ?? []) as { friend_id: string }[]).map((l) => l.friend_id)

  // El feed incluye lo tuyo: si no, publicar sería mandar algo a un sitio que
  // no puedes mirar, y nadie sabría si ha salido bien.
  const people = [...new Set([userId, ...friends])]

  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10)

  const { data } = await supabase
    .from('daily_shares')
    .select('id, user_id, outfit_id, note, shared_on')
    .in('user_id', people)
    .gte('shared_on', since)
    .order('shared_on', { ascending: false })
    .limit(40)

  const rows = (data ?? []) as {
    id: string
    user_id: string
    outfit_id: string
    note: string | null
    shared_on: string
  }[]

  if (rows.length === 0) return []

  const [{ data: profiles }, { data: grants }, { data: outfits }, { data: items }] =
    await Promise.all([
      supabase.from('profiles').select('id, display_name').in('id', people),
      // Quién te deja ver su armario: decide si sus prendas se pueden abrir.
      supabase.from('wardrobe_grants').select('owner_id').eq('viewer_id', userId),
      supabase
        .from('outfits')
        .select('id, context')
        .in(
          'id',
          rows.map((r) => r.outfit_id),
        ),
      supabase
        .from('outfit_items')
        .select('outfit_id, clothing_items(id, category, primary_color, fit, pattern, image_path)')
        .in(
          'outfit_id',
          rows.map((r) => r.outfit_id),
        ),
    ])

  const names = new Map<string, string>()
  for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    names.set(row.id, row.display_name?.trim() || ANON)
  }

  const canBorrowFrom = new Set(
    ((grants ?? []) as { owner_id: string }[]).map((g) => g.owner_id),
  )

  const context = new Map<string, Record<string, unknown>>()
  for (const row of (outfits ?? []) as { id: string; context: Record<string, unknown> }[]) {
    context.set(row.id, row.context ?? {})
  }

  type Garment = {
    id: string
    category: string
    primary_color: string
    fit: string | null
    pattern: string | null
    image_path: string | null
  }

  const joined = (items ?? []) as unknown as {
    outfit_id: string
    clothing_items: Garment | null
  }[]

  const paths = joined
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

  return rows.map((row) => {
    const ctx = context.get(row.outfit_id) ?? {}
    const highlights = Array.isArray(ctx.highlights) ? (ctx.highlights as string[]) : []

    return {
      id: row.id,
      userId: row.user_id,
      name: row.user_id === userId ? 'Tú' : (names.get(row.user_id) ?? ANON),
      isMine: row.user_id === userId,
      sharedOn: row.shared_on,
      note: row.note,
      lookName: typeof ctx.title === 'string' ? ctx.title : null,
      why: explainFromHighlights(highlights),
      garments: joined
        .filter((item) => item.outfit_id === row.outfit_id && item.clothing_items)
        .map((item) => {
          const garment = item.clothing_items!
          return {
            id: garment.id,
            label: describeGarment(garment),
            imageUrl: garment.image_path ? (urls.get(garment.image_path) ?? null) : null,
          }
        }),
      canBorrow: canBorrowFrom.has(row.user_id),
    }
  })
}

/** ¿He publicado ya hoy? Para no ofrecer un botón que no hace nada. */
export async function sharedToday(userId: string, today: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('daily_shares')
    .select('id')
    .eq('user_id', userId)
    .eq('shared_on', today)
    .maybeSingle()
  return Boolean(data)
}

/** Quién del círculo ha publicado hoy. El diseño lo enseña como iniciales. */
export async function whoSharedToday(userId: string, today: string): Promise<string[]> {
  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from('connections')
    .select('friend_id')
    .eq('user_id', userId)

  const friends = ((links ?? []) as { friend_id: string }[]).map((l) => l.friend_id)
  if (friends.length === 0) return []

  const { data } = await supabase
    .from('daily_shares')
    .select('user_id')
    .in('user_id', friends)
    .eq('shared_on', today)

  const ids = ((data ?? []) as { user_id: string }[]).map((d) => d.user_id)
  if (ids.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)

  return ((profiles ?? []) as { display_name: string | null }[]).map(
    (p) => p.display_name?.trim() || ANON,
  )
}
