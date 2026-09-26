import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { EMPTY_REFERENCE, type GarmentReference } from '@/lib/wardrobe/reference'

/**
 * El armario de otra persona.
 *
 * **Por qué esto no es una política de seguridad y sí código.**
 *
 * Lo natural habría sido abrir `clothing_items` a quien tenga permiso y dejar
 * que la base de datos hiciera el trabajo. Habría roto la aplicación entera en
 * silencio: ninguna consulta del armario filtra por `user_id` —todas se apoyan
 * en que RLS devuelve solo lo propio— así que la ropa de tus amigas habría
 * aparecido en tu armario, en el motor que te viste y en tu perfil de estilo.
 * Está explicado con más detalle en `0010_prestamos.sql`.
 *
 * Así que se lee desde aquí, con el service role, y las dos condiciones se
 * comprueban a mano y en este orden:
 *
 *  1. Existe un permiso de ese dueño hacia quien mira.
 *  2. Se pide **solo** la ropa de ese dueño, filtrando por `user_id`.
 *
 * Sin la primera, cualquiera vería cualquier armario. Sin la segunda, la
 * consulta devolvería el armario del mundo entero.
 */

export type GrantLevel = 'view' | 'style'

export interface SharedItem {
  id: string
  category: string
  primary_color: string
  fit: string | null
  pattern: string | null
  imageUrl: string | null
  /** Ahora mismo no está en su casa. */
  onLoan: boolean
  /** Ya se la has pedido y esperas respuesta. */
  requestedByMe: boolean
  /**
   * De donde es, para contestar a la pregunta que se hace siempre.
   *
   * Va sin el precio ni la fecha de compra, y es a proposito: lo que pagaste es
   * tuyo. Quien mira necesita el codigo para encontrar la prenda, no tu recibo.
   * La talla si va, porque en un armario que se presta es justo lo que hace
   * falta saber antes de pedir nada.
   */
  reference: GarmentReference
}

export interface SharedWardrobe {
  ownerId: string
  ownerName: string
  level: GrantLevel
  items: SharedItem[]
}

const ANON = 'Alguien'

/** Media hora: lo que dura mirar un armario ajeno con calma. */
const PHOTO_EXPIRY_SECONDS = 1800

/**
 * Devuelve `null` cuando no hay permiso, y no lanza ni distingue el motivo.
 *
 * Un mensaje distinto para «no tienes permiso» y para «esa persona no existe»
 * convertiría esta pantalla en una forma de averiguar quién está registrado.
 */
export async function getSharedWardrobe(
  ownerId: string,
  viewerId: string,
): Promise<SharedWardrobe | null> {
  if (ownerId === viewerId) return null

  const supabase = createAdminClient()

  // 1. ¿Hay permiso?
  const { data: grant } = await supabase
    .from('wardrobe_grants')
    .select('level')
    .eq('owner_id', ownerId)
    .eq('viewer_id', viewerId)
    .maybeSingle()

  if (!grant) return null

  const [{ data: profile }, { data: items }, { data: loans }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', ownerId).maybeSingle(),
    // 2. Solo la ropa de esa persona. El filtro es la mitad de la seguridad.
    supabase
      .from('clothing_items')
      // El texto del select va de una pieza: el cliente de Supabase deduce el
      // tipo de la fila leyendo ese literal, y partirlo con un `+` se lo impide.
      // prettier-ignore
      .select('id, category, primary_color, fit, pattern, image_path, is_available, brand, product_name, reference_code, brand_color, size, source_url')
      .eq('user_id', ownerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('loans')
      .select('item_id, borrower_id, status')
      .eq('owner_id', ownerId)
      .in('status', ['requested', 'accepted']),
  ])

  const rows = (items ?? []) as {
    id: string
    category: string
    primary_color: string
    fit: string | null
    pattern: string | null
    image_path: string | null
    is_available: boolean
    brand: string | null
    product_name: string | null
    reference_code: string | null
    brand_color: string | null
    size: string | null
    source_url: string | null
  }[]

  const live = (loans ?? []) as { item_id: string; borrower_id: string; status: string }[]

  const signed = await supabase.storage
    .from(BUCKETS.clothing)
    .createSignedUrls(
      rows.map((r) => r.image_path).filter((p): p is string => Boolean(p)),
      PHOTO_EXPIRY_SECONDS,
    )

  const urls = new Map<string, string>()
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }

  return {
    ownerId,
    ownerName:
      (profile as { display_name: string | null } | null)?.display_name?.trim() || ANON,
    level: (grant as { level: GrantLevel }).level,
    items: rows.map((row) => {
      const loan = live.find((l) => l.item_id === row.id)
      return {
        id: row.id,
        category: row.category,
        primary_color: row.primary_color,
        fit: row.fit,
        pattern: row.pattern,
        imageUrl: row.image_path ? (urls.get(row.image_path) ?? null) : null,
        onLoan: loan?.status === 'accepted',
        requestedByMe: loan?.borrower_id === viewerId && loan?.status === 'requested',
        reference: {
          ...EMPTY_REFERENCE,
          brand: row.brand,
          product_name: row.product_name,
          reference_code: row.reference_code,
          brand_color: row.brand_color,
          size: row.size,
          source_url: row.source_url,
        },
      }
    }),
  }
}
