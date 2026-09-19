'use server'

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { checkEntitlement, consumeEntitlement } from '@/lib/subscriptions/entitlements'
import { fromStored } from '@/lib/style/profile'
import { generateOutfits } from '@/lib/outfits/engine'
import { loadWardrobe, markOutfitWorn, saveOutfits } from '@/lib/outfits/persist'
import { seasonOf } from '@/lib/outfits/filters'
import { fetchWeather, manualWeather, searchPlaces, type Weather } from '@/lib/weather/provider'
import { describeGarment } from '@/lib/wardrobe/labels'
import { ai } from '@/lib/ai/router'
import { OCCASIONS } from '@/lib/wardrobe/taxonomy'

/**
 * "¿Qué me pongo?"
 *
 * Orquesta la petición completa. El motor decide; la IA, como mucho, redacta la
 * frase que acompaña a cada look — y si falla, los looks se enseñan igual.
 *
 * Esta pieza vive en `app/` y no en `lib/outfits/` a propósito: el motor no debe
 * poder tocar la IA ni de lejos, y hay un test que lo comprueba.
 */

const requestSchema = z.object({
  occasion: z.enum(OCCASIONS as unknown as [string, ...string[]]).optional(),
  formality: z.coerce.number().int().min(1).max(5).optional(),
  temperatureC: z.coerce.number().min(-30).max(55).optional(),
  rain: z.boolean().optional(),
  useAutoWeather: z.boolean(),
})

export interface RequestState {
  error?: string
}

export async function requestOutfits(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const user = await requireUser()

  const permiso = await checkEntitlement(user.id, 'request_outfits')
  if (!permiso.allowed) {
    return {
      error:
        permiso.reason === 'not_in_plan'
          ? 'Tu plan no incluye esta función.'
          : `Has llegado al límite de hoy (${permiso.used} de ${permiso.limit}). Vuelve mañana.`,
    }
  }

  const parsed = requestSchema.safeParse({
    occasion: formData.get('occasion') || undefined,
    formality: formData.get('formality') || undefined,
    temperatureC: formData.get('temperatureC') || undefined,
    rain: formData.get('rain') === 'true',
    useAutoWeather: formData.get('useAutoWeather') !== 'false',
  })
  if (!parsed.success) return { error: 'Revisa los datos.' }

  const supabase = await createClient()

  const [{ data: profileRow }, { data: prefsRow }] = await Promise.all([
    supabase.from('style_profile').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
  ])

  const profile = fromStored(profileRow as never)
  const prefs = (prefsRow ?? {}) as {
    disliked_colors?: string[]
    never_combine?: Array<[string, string]>
    lat?: number | null
    lon?: number | null
  }

  // --- Clima ---------------------------------------------------------------
  let weather: Weather | null = null

  if (parsed.data.useAutoWeather && prefs.lat != null && prefs.lon != null) {
    weather = await fetchWeather({ lat: prefs.lat, lon: prefs.lon })
  }
  // Si la API falla o no hay ubicación, vale lo que haya escrito la persona.
  if (!weather && parsed.data.temperatureC !== undefined) {
    weather = manualWeather(parsed.data.temperatureC, parsed.data.rain ?? false)
  }

  const context = {
    occasion: parsed.data.occasion as never,
    formality: parsed.data.formality,
    temperatureC: weather?.temperatureC,
    rain: weather?.rain,
    season: seasonOf(new Date()),
    today: new Date(),
  }

  // --- Motor ---------------------------------------------------------------
  const wardrobe = await loadWardrobe(supabase, user.id)

  const result = generateOutfits({
    wardrobe,
    profile,
    context,
    dislikedColors: prefs.disliked_colors ?? [],
    neverCombine: prefs.never_combine ?? [],
    count: 3,
  })

  if (result.outfits.length === 0) {
    return {
      error:
        result.emptyReason === 'no_wardrobe'
          ? 'Todavía no tienes prendas en el armario.'
          : 'Con lo que tienes disponible ahora mismo no consigo montar nada. Prueba a marcar como disponibles algunas prendas guardadas.',
    }
  }

  // --- Explicaciones: UNA llamada para los tres looks -----------------------
  let explanations: string[] = []
  try {
    const { data } = await ai.stylist.explainOutfits(
      result.outfits.map((outfit) => ({
        items: outfit.items.map((item) => describeGarment(item)),
        highlights: outfit.highlights,
      })),
      {
        occasion: parsed.data.occasion,
        temperatureC: weather?.temperatureC,
        rain: weather?.rain,
      },
      { userId: user.id },
    )
    explanations = data
  } catch (err) {
    // Los looks ya están elegidos: la frase es un adorno, no el producto.
    console.error('[outfits] sin explicaciones:', err)
  }

  // --- Guardar --------------------------------------------------------------
  const requestId = randomUUID()
  const ids = await saveOutfits(user.id, requestId, result.outfits, context, explanations)

  if (ids.length === 0) {
    return { error: 'No hemos podido guardar las propuestas. Inténtalo de nuevo.' }
  }

  await consumeEntitlement(user.id, 'request_outfits')

  revalidatePath('/outfits')
  redirect(`/outfits/propuesta/${requestId}`)
}

/** Registra que un look se ha llevado puesto. */
export async function markWorn(outfitId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const result = await markOutfitWorn(supabase, user.id, outfitId)

  revalidatePath('/armario')
  revalidatePath('/outfits')
  return result
}

/** Guarda la ubicación para poder consultar el tiempo sin preguntar cada vez. */
export async function saveLocation(query: string) {
  const user = await requireUser()

  const places = await searchPlaces(query, 1)
  const place = places[0]
  if (!place) return { ok: false as const, error: 'No he encontrado ese sitio.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_preferences')
    .update({ city: place.name, lat: place.lat, lon: place.lon })
    .eq('user_id', user.id)

  if (error) return { ok: false as const, error: 'No hemos podido guardar la ubicación.' }

  revalidatePath('/outfits/que-me-pongo')
  return { ok: true as const, place }
}
