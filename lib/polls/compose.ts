import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateOutfits } from '@/lib/outfits/engine'
import { loadWardrobe, saveOutfits } from '@/lib/outfits/persist'
import { fromStored } from '@/lib/style/profile'
import { seasonOf } from '@/lib/outfits/filters'
import { fetchWeather } from '@/lib/weather/provider'
import type { Occasion } from '@/lib/wardrobe/taxonomy'

/**
 * Los tres looks que se someten a votación.
 *
 * Es la idea del diseño y mejora lo que había: antes, para preguntar «¿cuál me
 * pongo?» había que ponerse las dos opciones y fotografiarlas, o sea vestirse
 * dos veces antes de decidir cómo vestirse. Aquí los monta el motor con la ropa
 * que ya está en el armario y lo único que queda por hacer es preguntar.
 *
 * **No gasta IA ni cupo.** Como el look del día: el motor es cálculo puro y la
 * frase que acompaña a cada look sale de sus propios criterios
 * (`explainFromHighlights`), no de un modelo. Una votación no puede costar
 * dinero cada vez que alguien tiene prisa por la mañana.
 */

export interface ComposedPoll {
  requestId: string
  outfitIds: string[]
}

export async function composePollLooks(
  supabase: SupabaseClient,
  userId: string,
  options: { occasion?: Occasion; count?: number } = {},
): Promise<ComposedPoll | { error: string }> {
  const [{ data: profileRow }, { data: prefsRow }] = await Promise.all([
    supabase.from('style_profile').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('user_preferences')
      .select('disliked_colors, never_combine, lat, lon')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const prefs = (prefsRow ?? {}) as {
    disliked_colors?: string[]
    never_combine?: Array<[string, string]>
    lat?: number | null
    lon?: number | null
  }

  const wardrobe = await loadWardrobe(supabase, userId)
  if (wardrobe.length === 0) {
    return { error: 'Todavía no tienes prendas en el armario.' }
  }

  // El tiempo, si lo sabemos. Si la API falla, el motor compone sin él: es
  // mejor una votación sin temperatura que ninguna votación.
  const weather =
    prefs.lat != null && prefs.lon != null
      ? await fetchWeather({ lat: prefs.lat, lon: prefs.lon })
      : null

  const now = new Date()
  const context = {
    occasion: options.occasion,
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
    count: options.count ?? 3,
  })

  /*
   * Con menos de dos no hay votación que valga: preguntar «¿cuál me pongo?»
   * con una sola opción es pedir permiso, no pedir opinión.
   */
  if (result.outfits.length < 2) {
    return {
      error:
        result.emptyReason === 'no_wardrobe'
          ? 'Todavía no tienes prendas en el armario.'
          : 'Con lo disponible ahora mismo no consigo montar dos looks distintos. Prueba con otra ocasión, o haz fotos de lo que dudas.',
    }
  }

  const requestId = randomUUID()
  // Sin explicaciones de IA: el tercer parámetro va vacío a propósito.
  const outfitIds = await saveOutfits(userId, requestId, result.outfits, context, [])

  if (outfitIds.length < 2) return { error: 'No hemos podido guardar los looks.' }

  return { requestId, outfitIds }
}
