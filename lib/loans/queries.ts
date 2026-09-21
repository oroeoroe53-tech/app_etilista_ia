import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'

/**
 * Los préstamos de alguien, contados desde su punto de vista.
 *
 * Tres montones, porque son tres cosas que se hacen en momentos distintos:
 *
 *  · **Te han pedido** — lo único que exige una respuesta. Va primero.
 *  · **Tienes de otras** — lo que hay que devolver, y lo que más se olvida.
 *  · **Has pedido** — lo que esperas.
 *
 * Se usa el service role por la misma razón de siempre: los nombres y las fotos
 * están del otro lado de RLS. Todo se filtra explícitamente por el usuario que
 * pregunta, en las dos direcciones.
 */

export type LoanStatus = 'requested' | 'accepted' | 'declined' | 'returned' | 'cancelled'

export interface LoanView {
  id: string
  itemId: string
  itemLabel: { category: string; primary_color: string; fit: string | null; pattern: string | null }
  imageUrl: string | null
  /** La otra parte: quien pide si es tuyo, quien presta si no. */
  otherName: string
  status: LoanStatus
  message: string | null
  dueOn: string | null
  requestedAt: string
}

export interface LoanBoard {
  /** Te la piden y no has contestado. */
  incoming: LoanView[]
  /** La tienes tú, de otra persona. */
  borrowed: LoanView[]
  /** La has pedido y esperas. */
  outgoing: LoanView[]
  /** Tuyas que están fuera de casa. */
  lentOut: LoanView[]
}

const ANON = 'Alguien'

interface Row {
  id: string
  item_id: string
  owner_id: string
  borrower_id: string
  status: LoanStatus
  message: string | null
  due_on: string | null
  requested_at: string
}

export async function getLoanBoard(userId: string): Promise<LoanBoard> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('loans')
    .select('id, item_id, owner_id, borrower_id, status, message, due_on, requested_at')
    .or(`owner_id.eq.${userId},borrower_id.eq.${userId}`)
    .in('status', ['requested', 'accepted'])
    .order('requested_at', { ascending: false })

  const rows = (data ?? []) as Row[]
  const empty: LoanBoard = { incoming: [], borrowed: [], outgoing: [], lentOut: [] }
  if (rows.length === 0) return empty

  const others = [
    ...new Set(rows.map((r) => (r.owner_id === userId ? r.borrower_id : r.owner_id))),
  ]

  const [{ data: profiles }, { data: items }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', others),
    supabase
      .from('clothing_items')
      .select('id, category, primary_color, fit, pattern, image_path')
      .in('id', [...new Set(rows.map((r) => r.item_id))]),
  ])

  const names = new Map<string, string>()
  for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    names.set(row.id, row.display_name?.trim() || ANON)
  }

  const garments = new Map<
    string,
    {
      category: string
      primary_color: string
      fit: string | null
      pattern: string | null
      image_path: string | null
    }
  >()
  for (const row of (items ?? []) as never[]) {
    const item = row as unknown as { id: string } & {
      category: string
      primary_color: string
      fit: string | null
      pattern: string | null
      image_path: string | null
    }
    garments.set(item.id, item)
  }

  const signed = await supabase.storage
    .from(BUCKETS.clothing)
    .createSignedUrls(
      [...garments.values()].map((g) => g.image_path).filter((p): p is string => Boolean(p)),
      1800,
    )

  const urls = new Map<string, string>()
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }

  const board: LoanBoard = { incoming: [], borrowed: [], outgoing: [], lentOut: [] }

  for (const row of rows) {
    const garment = garments.get(row.item_id)
    if (!garment) continue

    const mine = row.owner_id === userId

    const view: LoanView = {
      id: row.id,
      itemId: row.item_id,
      itemLabel: {
        category: garment.category,
        primary_color: garment.primary_color,
        fit: garment.fit,
        pattern: garment.pattern,
      },
      imageUrl: garment.image_path ? (urls.get(garment.image_path) ?? null) : null,
      otherName: names.get(mine ? row.borrower_id : row.owner_id) ?? ANON,
      status: row.status,
      message: row.message,
      dueOn: row.due_on,
      requestedAt: row.requested_at,
    }

    if (mine && row.status === 'requested') board.incoming.push(view)
    else if (mine) board.lentOut.push(view)
    else if (row.status === 'requested') board.outgoing.push(view)
    else board.borrowed.push(view)
  }

  return board
}

/** Cuántas peticiones esperan respuesta. Para el aviso de Perfil. */
export async function countIncoming(userId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('loans')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('status', 'requested')
  return count ?? 0
}
