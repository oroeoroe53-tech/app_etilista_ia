import type { SupabaseClient } from '@supabase/supabase-js'
import { fromStored } from '@/lib/style/profile'
import { describeGarment } from '@/lib/wardrobe/labels'
import type { Weather } from '@/lib/weather/provider'
import { generateOutfits } from './engine'
import { loadWardrobe, saveOutfits } from './persist'
import { seasonOf } from './filters'
import { explainFromHighlights, nameOutfit } from './name'
import { track } from '@/lib/observability/funnel'

/**
 * El look de hoy.
 *
 * La portada enseña una propuesta ya hecha, no un botón para pedirla. Eso
 * plantea un problema que merece explicarse, porque condiciona todo lo demás:
 *
 *   Abrir la aplicación no puede gastar cupo.
 *
 * "¿Qué me pongo?" consume una de las diez propuestas diarias del plan gratuito
 * y una llamada de IA para redactar las frases. Si la portada hiciera lo mismo,
 * alguien que abriera la aplicación diez veces en un día se quedaría sin cupo
 * sin haber pedido nada. Sería absurdo y además caro.
 *
 * Así que el look de hoy usa **solo el motor**: cálculo puro, sin IA, sin cupo.
 * Se compone una vez al día, se guarda, y el resto de visitas de la jornada
 * leen esa misma fila. Mañana se compone otro.
 *
 * Lo que se pierde: la frase redactada por el modelo. En su lugar va una hecha
 * con los motivos que el motor ya había calculado (`name.ts`). Dice menos, pero
 * dice verdad, y las tres opciones de "¿Qué me pongo?" siguen teniendo la suya.
 */

export interface DailyLook {
  outfitId: string
  title: string
  explanation: string | null
  /** 0–100, ya redondeado: es lo que se enseña como "92%". */
  match: number
  items: Array<{ id: string; name: string; imagePath: string | null }>
}

/**
 * Clave del día.
 *
 * En el servidor esto es la fecha UTC, igual que la que se imprime en la
 * cabecera de la portada. Las dos se calculan en el mismo sitio, así que no
 * pueden desajustarse entre sí aunque ninguna sea la hora local de la persona.
 */
function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

interface OutfitRow {
  id: string
  explanation: string | null
  score: number | null
  context: { highlights?: string[]; title?: string } | null
}

/**
 * Devuelve el look de hoy, componiéndolo si todavía no existe.
 *
 * Nunca lanza: si el armario está vacío o no se puede guardar, devuelve `null`
 * y la portada enseña la invitación a montar el armario en su lugar.
 */
export async function getDailyLook(
  supabase: SupabaseClient,
  userId: string,
  /*
   * El tiempo llega ya consultado desde la portada, que también lo enseña en la
   * cabecera. Pedirlo dos veces sería dos viajes a la red para el mismo dato.
   */
  weather: Weather | null = null,
): Promise<DailyLook | null> {
  const today = dayKey(new Date())

  const existing = await loadExisting(supabase, today)
  if (existing) return existing

  /*
   * A partir de aquí solo se llega una vez al día: si el look de hoy ya
   * estaba, la función ha vuelto arriba. Eso hace de este punto el contador
   * de "ha abierto la aplicación hoy" sin necesidad de ninguna lógica extra.
   */
  track('opened_day', userId)

  const [{ data: profileRow }, { data: prefsRow }] = await Promise.all([
    supabase.from('style_profile').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('user_preferences').select('disliked_colors, never_combine').eq('user_id', userId).maybeSingle(),
  ])

  const prefs = (prefsRow ?? {}) as {
    disliked_colors?: string[]
    never_combine?: Array<[string, string]>
  }

  const wardrobe = await loadWardrobe(supabase, userId)
  if (wardrobe.length === 0) return null

  const now = new Date()
  const context = {
    temperatureC: weather?.temperatureC,
    rain: weather?.rain,
    season: seasonOf(now),
    today: now,
  }

  const result = generateOutfits({
    wardrobe,
    profile: fromStored(profileRow as never),
    context,
    dislikedColors: prefs.disliked_colors ?? [],
    neverCombine: prefs.never_combine ?? [],
    count: 1,
  })

  const best = result.outfits[0]
  if (!best) return null

  const title = nameOutfit(best.items)

  /*
   * Se guarda con `daily_on` dentro de `context`. Esa marca es lo único que
   * distingue el look de la portada de los que salen de "¿Qué me pongo?", y es
   * también lo que permite que "Me lo pongo" funcione igual en los dos sitios:
   * al final las dos cosas son una fila de `outfits` con sus prendas.
   */
  const ids = await saveOutfits(userId, `daily-${today}`, [best], context, [], {
    daily_on: today,
  })
  const outfitId = ids[0]
  if (!outfitId) return null

  /*
   * El motor no carga `image_path` —no lo necesita para decidir— así que las
   * fotos se piden aparte. Una consulta más, solo el día que se compone.
   */
  const photos = await imagePathsFor(
    supabase,
    best.items.map((item) => item.id),
  )

  return {
    outfitId,
    title,
    explanation: explainFromHighlights(best.highlights),
    match: Math.round(best.score * 100),
    items: best.items.map((item) => ({
      id: item.id,
      name: describeGarment(item),
      imagePath: photos.get(item.id) ?? null,
    })),
  }
}

async function imagePathsFor(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()

  const { data } = await supabase
    .from('clothing_items')
    .select('id, image_path')
    .in('id', ids as string[])

  return new Map(
    ((data ?? []) as Array<{ id: string; image_path: string | null }>).map((row) => [
      row.id,
      row.image_path,
    ]),
  )
}

/** Carga el look de hoy si ya se compuso, con sus prendas y sus fotos. */
async function loadExisting(
  supabase: SupabaseClient,
  today: string,
): Promise<DailyLook | null> {
  const { data } = await supabase
    .from('outfits')
    .select('id, explanation, score, context')
    .eq('context->>daily_on', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const row = data as OutfitRow | null
  if (!row) return null

  const { data: links } = await supabase
    .from('outfit_items')
    .select('clothing_item_id')
    .eq('outfit_id', row.id)

  const ids = ((links ?? []) as Array<{ clothing_item_id: string }>).map(
    (l) => l.clothing_item_id,
  )
  if (ids.length === 0) return null

  const { data: itemRows } = await supabase
    .from('clothing_items')
    .select('id, category, primary_color, fit, pattern, image_path')
    .in('id', ids)
    .is('deleted_at', null)

  const items = ((itemRows ?? []) as Array<{
    id: string
    category: string
    primary_color: string
    fit: string | null
    pattern: string | null
    image_path: string | null
  }>).map((item) => ({
    id: item.id,
    name: describeGarment(item),
    imagePath: item.image_path,
  }))

  /*
   * Si una prenda del look de hoy se ha borrado desde que se compuso, el look
   * ya no es el que era: mejor recomponerlo que enseñar un hueco.
   *
   * Hay que quitarle la marca del día antes de devolver `null`, o la fila
   * seguiría siendo "el look de hoy" y se compondría uno nuevo en cada visita.
   */
  if (items.length < ids.length) {
    await supabase
      .from('outfits')
      .update({ context: { ...(row.context ?? {}), daily_on: null } })
      .eq('id', row.id)
    return null
  }

  return {
    outfitId: row.id,
    title: row.context?.title ?? 'El look de hoy',
    explanation: row.explanation ?? explainFromHighlights(row.context?.highlights ?? []),
    match: Math.round((row.score ?? 0) * 100),
    items,
  }
}
