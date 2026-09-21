import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'

/**
 * Los looks que te han montado.
 *
 * Mismo patrón que el resto de lo social: el service role, porque los nombres y
 * las fotos están del otro lado de RLS, y un filtro explícito por quien
 * pregunta en las dos direcciones —eres quien lo lleva o quien lo montó, y no
 * hay tercera opción.
 */

export interface StyledItem {
  id: string
  category: string
  primary_color: string
  fit: string | null
  pattern: string | null
  imageUrl: string | null
}

export interface StyledLook {
  id: string
  note: string | null
  createdAt: string
  seenAt: string | null
  /** La otra parte: quien lo montó si es para ti, quien lo lleva si lo montaste tú. */
  otherName: string
  /** Es para ti. */
  forMe: boolean
  items: StyledItem[]
}

const ANON = 'Alguien'
const PHOTO_EXPIRY_SECONDS = 1800

interface LookRow {
  id: string
  owner_id: string
  stylist_id: string
  note: string | null
  seen_at: string | null
  created_at: string
  styled_look_items: { item_id: string; position: number }[]
}

export async function listStyledLooks(userId: string): Promise<StyledLook[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('styled_looks')
    .select('id, owner_id, stylist_id, note, seen_at, created_at, styled_look_items(item_id, position)')
    .or(`owner_id.eq.${userId},stylist_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(30)

  const rows = (data ?? []) as LookRow[]
  if (rows.length === 0) return []

  const itemIds = [...new Set(rows.flatMap((r) => r.styled_look_items.map((i) => i.item_id)))]
  const people = [...new Set(rows.flatMap((r) => [r.owner_id, r.stylist_id]))]

  const [{ data: profiles }, { data: items }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', people),
    supabase
      .from('clothing_items')
      .select('id, category, primary_color, fit, pattern, image_path')
      .in('id', itemIds),
  ])

  const names = new Map<string, string>()
  for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    names.set(row.id, row.display_name?.trim() || ANON)
  }

  type ItemRow = {
    id: string
    category: string
    primary_color: string
    fit: string | null
    pattern: string | null
    image_path: string | null
  }

  const garments = new Map<string, ItemRow>()
  for (const row of (items ?? []) as ItemRow[]) garments.set(row.id, row)

  const signed = await supabase.storage
    .from(BUCKETS.clothing)
    .createSignedUrls(
      [...garments.values()].map((g) => g.image_path).filter((p): p is string => Boolean(p)),
      PHOTO_EXPIRY_SECONDS,
    )

  const urls = new Map<string, string>()
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }

  return rows.map((row) => {
    const forMe = row.owner_id === userId
    return {
      id: row.id,
      note: row.note,
      createdAt: row.created_at,
      seenAt: row.seen_at,
      otherName: names.get(forMe ? row.stylist_id : row.owner_id) ?? ANON,
      forMe,
      items: row.styled_look_items
        .sort((a, b) => a.position - b.position)
        .map((entry) => garments.get(entry.item_id))
        .filter((g): g is ItemRow => Boolean(g))
        .map((g) => ({
          id: g.id,
          category: g.category,
          primary_color: g.primary_color,
          fit: g.fit,
          pattern: g.pattern,
          imageUrl: g.image_path ? (urls.get(g.image_path) ?? null) : null,
        })),
    }
  })
}

/**
 * Los que te han montado y todavía no has visto.
 *
 * Es lo que enseña la portada. Sin este aviso, un look montado por otra persona
 * se quedaría esperando en una pantalla a la que nadie entra a diario, y quien
 * se molestó en montarlo pensaría que no le hacen caso.
 */
export async function countUnseenLooks(userId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('styled_looks')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .is('seen_at', null)
  return count ?? 0
}
