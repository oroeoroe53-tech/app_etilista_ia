'use server'

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEntitlement, consumeEntitlement } from '@/lib/subscriptions/entitlements'
import { checkRateLimit, rateLimitMessage, RATE_LIMITS } from '@/lib/security/rate-limit'
import { fromStored } from '@/lib/style/profile'
import { planPacking } from '@/lib/outfits/packing'
import { loadWardrobe } from '@/lib/outfits/persist'
import { seasonOf } from '@/lib/outfits/filters'
import { fetchForecast, searchPlaces } from '@/lib/weather/provider'
import { layerOf, type Category } from '@/lib/wardrobe/taxonomy'
import { log } from '@/lib/observability/log'
import type { OutfitContext } from '@/lib/outfits/types'

/**
 * Planificar la maleta.
 *
 * Consume el mismo cupo que "¿qué me pongo?": es la misma operación del motor,
 * solo que repetida para varios días.
 *
 * No gasta IA. Ni una llamada.
 */

const schema = z.object({
  destination: z.string().trim().max(80).optional(),
  days: z.coerce.number().int().min(1).max(14),
  formality: z.coerce.number().int().min(1).max(5).optional(),
})

export interface PackingState {
  error?: string
}

export async function planTrip(
  _prev: PackingState,
  formData: FormData,
): Promise<PackingState> {
  const user = await requireUser()

  const rate = await checkRateLimit(user.id, RATE_LIMITS.outfitRequest)
  if (!rate.allowed) return { error: rateLimitMessage(rate) }

  const permiso = await checkEntitlement(user.id, 'request_outfits')
  if (!permiso.allowed) {
    return { error: `Has llegado al límite de hoy (${permiso.used} de ${permiso.limit}).` }
  }

  const parsed = schema.safeParse({
    destination: formData.get('destination') || undefined,
    days: formData.get('days'),
    formality: formData.get('formality') || undefined,
  })
  if (!parsed.success) return { error: 'Revisa los datos del viaje.' }

  const supabase = await createClient()

  const [{ data: profileRow }, { data: prefsRow }] = await Promise.all([
    supabase.from('style_profile').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
  ])

  const prefs = (prefsRow ?? {}) as {
    disliked_colors?: string[]
    never_combine?: Array<[string, string]>
  }

  // --- El tiempo en destino ------------------------------------------------
  // Si no se puede saber, se planifica con la temporada. Un viaje mal
  // pronosticado sigue siendo mejor que no poder planificarlo.
  let forecast: Awaited<ReturnType<typeof fetchForecast>> = []
  let placeName: string | null = null

  if (parsed.data.destination) {
    const places = await searchPlaces(parsed.data.destination, 1)
    const place = places[0]
    if (place) {
      placeName = place.name
      forecast = await fetchForecast({ lat: place.lat, lon: place.lon }, parsed.data.days)
    }
  }

  const today = new Date()
  const days: OutfitContext[] = Array.from({ length: parsed.data.days }, (_, i) => {
    const date = new Date(today.getTime() + i * 86_400_000)
    const dayForecast = forecast[i]

    return {
      formality: parsed.data.formality,
      // La media entre máxima y mínima: uno no se viste para el pico del día.
      temperatureC: dayForecast
        ? Math.round((dayForecast.maxC + dayForecast.minC) / 2)
        : undefined,
      rain: dayForecast?.rain,
      season: seasonOf(date),
      today: date,
    }
  })

  // --- Planificar ----------------------------------------------------------
  const wardrobe = await loadWardrobe(supabase, user.id)

  const result = planPacking({
    wardrobe,
    profile: fromStored(profileRow as never),
    days,
    dislikedColors: prefs.disliked_colors ?? [],
    neverCombine: prefs.never_combine ?? [],
  })

  if (result.days.length === 0) {
    return {
      error:
        result.emptyReason === 'no_wardrobe'
          ? 'Todavía no tienes prendas en el armario.'
          : 'Con lo que tienes disponible no consigo montar el viaje. Prueba a marcar como disponibles algunas prendas guardadas.',
    }
  }

  // --- Guardar --------------------------------------------------------------
  const admin = createAdminClient()
  const tripId = randomUUID()

  const { data: created, error } = await admin
    .from('outfits')
    .insert(
      result.days.map((day) => ({
        user_id: user.id,
        source: 'engine' as const,
        context: {
          trip_id: tripId,
          position: day.index,
          kind: 'packing',
          destination: placeName,
          temperature_c: day.context.temperatureC ?? null,
          rain: day.context.rain ?? false,
          highlights: day.outfit.highlights,
        },
        score: day.outfit.score,
        score_breakdown: day.outfit.breakdown,
      })),
    )
    .select('id')

  if (error || !created) {
    log.error({ event: 'packing.save-failed', userId: user.id, error })
    return { error: 'No hemos podido guardar el viaje.' }
  }

  const ids = (created as Array<{ id: string }>).map((row) => row.id)

  await admin.from('outfit_items').insert(
    result.days.flatMap((day, index) =>
      day.outfit.items.map((item) => ({
        outfit_id: ids[index]!,
        clothing_item_id: item.id,
        role: layerOf(item.category as Category),
      })),
    ),
  )

  await consumeEntitlement(user.id, 'request_outfits')

  log.info({
    event: 'packing.planned',
    userId: user.id,
    days: result.days.length,
    items: result.items.length,
    reused: result.reusedCount,
  })

  redirect(`/outfits/maleta/${tripId}`)
}
