import { createAdminClient } from '@/lib/supabase/admin'
import { generateOutfits } from '@/lib/outfits/engine'
import { loadWardrobe } from '@/lib/outfits/persist'
import { seasonOf } from '@/lib/outfits/filters'
import { fromStored } from '@/lib/style/profile'
import { nameOutfit, explainFromHighlights } from '@/lib/outfits/name'
import { describeGarment } from '@/lib/wardrobe/labels'
import { BUCKETS } from '@/lib/storage/paths'

/**
 * «Vísteme con tu armario».
 *
 * Un look montado con la ropa de otra persona, elegido para **tu** estilo. Es
 * la idea más fina del rediseño, porque contesta a la pregunta que de verdad
 * lleva a alguien a mirar el armario de una amiga: no «qué tiene», sino «qué
 * tiene que a mí me quedaría bien y yo no tengo».
 *
 * Cómo se hace, con piezas que ya existían:
 *
 *  1. Su armario entra en el motor **con tu perfil de estilo**. El mismo motor
 *     de siempre; lo que cambia es de quién es la ropa y de quién es el gusto.
 *  2. De las prendas del look se elige **la protagonista**: la que tú no
 *     tienes. Esa es la que se ofrece en préstamo, porque pedir prestado lo que
 *     ya tienes en casa no le interesa a nadie.
 *
 * Lo que NO hace: mirar su armario entero para decirte qué te falta. Solo se
 * usan las prendas que ella ha decidido compartir, y el resultado es un look,
 * no un inventario de lo que tiene.
 */

export interface BorrowedGarment {
  id: string
  label: string
  imageUrl: string | null
  /** La prenda que hace el look y que tú no tienes. */
  hero: boolean
}

export interface BorrowedLook {
  name: string
  why: string | null
  garments: BorrowedGarment[]
  hero: BorrowedGarment | null
}

/** Media hora, como el resto del armario compartido. */
const PHOTO_EXPIRY_SECONDS = 1800

export async function composeBorrowedLook(
  ownerId: string,
  viewerId: string,
): Promise<BorrowedLook | null> {
  const supabase = createAdminClient()

  // El permiso, primero y siempre. Sin él esto no existe.
  const { data: grant } = await supabase
    .from('wardrobe_grants')
    .select('level')
    .eq('owner_id', ownerId)
    .eq('viewer_id', viewerId)
    .maybeSingle()

  if (!grant) return null

  const [hers, mine, { data: profileRow }, { data: prefsRow }] = await Promise.all([
    loadWardrobe(supabase, ownerId),
    loadWardrobe(supabase, viewerId),
    // El perfil de estilo de QUIEN MIRA: el look se monta para ti, con su ropa.
    supabase.from('style_profile').select('*').eq('user_id', viewerId).maybeSingle(),
    supabase
      .from('user_preferences')
      .select('disliked_colors, never_combine')
      .eq('user_id', viewerId)
      .maybeSingle(),
  ])

  if (hers.length === 0) return null

  const prefs = (prefsRow ?? {}) as {
    disliked_colors?: string[]
    never_combine?: Array<[string, string]>
  }

  const now = new Date()
  const result = generateOutfits({
    wardrobe: hers,
    profile: fromStored(profileRow as never),
    context: { season: seasonOf(now), today: now },
    dislikedColors: prefs.disliked_colors ?? [],
    neverCombine: prefs.never_combine ?? [],
    count: 1,
  })

  const look = result.outfits[0]
  if (!look) return null

  /*
   * La protagonista: una prenda suya de una categoría que tú no tienes, o —si
   * las tienes todas— de un color que no tienes en esa categoría. Si resulta
   * que tienes de todo, no hay protagonista y la tarjeta lo dice en vez de
   * inventarse una.
   */
  const myCategories = new Set(mine.map((item) => item.category))
  const myPairs = new Set(mine.map((item) => `${item.category}:${item.primary_color}`))

  const hero =
    look.items.find((item) => !myCategories.has(item.category)) ??
    look.items.find((item) => !myPairs.has(`${item.category}:${item.primary_color}`)) ??
    null

  /*
   * Las fotos se piden aparte a propósito.
   *
   * `WardrobeItem` no lleva la imagen porque el motor no la necesita para nada:
   * compone con atributos. Meterla ahí solo para ahorrarse esta consulta
   * ensuciaría el tipo del que depende todo el motor.
   */
  const { data: photoRows } = await supabase
    .from('clothing_items')
    .select('id, image_path')
    .eq('user_id', ownerId)
    .in(
      'id',
      look.items.map((item) => item.id),
    )

  const photos = new Map<string, string>()
  for (const row of (photoRows ?? []) as { id: string; image_path: string | null }[]) {
    if (row.image_path) photos.set(row.id, row.image_path)
  }

  const paths = [...photos.values()]

  const signed =
    paths.length > 0
      ? await supabase.storage.from(BUCKETS.clothing).createSignedUrls(paths, PHOTO_EXPIRY_SECONDS)
      : { data: [] }

  const urls = new Map<string, string>()
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }

  const garments: BorrowedGarment[] = look.items.map((item) => {
    const path = photos.get(item.id)
    return {
      id: item.id,
      label: describeGarment(item),
      imageUrl: path ? (urls.get(path) ?? null) : null,
      hero: item.id === hero?.id,
    }
  })

  return {
    name: nameOutfit(look.items),
    why: explainFromHighlights(look.highlights),
    garments,
    hero: garments.find((g) => g.hero) ?? null,
  }
}
