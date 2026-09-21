import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { fetchWeather } from '@/lib/weather/provider'
import { getDailyLook } from './daily'

/**
 * El look de hoy, calculado **una vez por petición**.
 *
 * La portada lo necesita en dos sitios: el titular («Hoy te veo *en neutros*»)
 * y la tarjeta. Los dos se transmiten por separado para que la pantalla aparezca
 * antes, y sin esto cada uno dispararía su propio cálculo: dos consultas del
 * tiempo, dos cargas del armario y dos pasadas del motor para el mismo
 * resultado.
 *
 * `cache()` de React memoriza dentro de la misma petición y no más allá. No es
 * una caché entre visitas —eso ya lo hace `daily_on` en la base de datos, que
 * es donde debe estar— sino la forma de que dos partes de la misma pantalla
 * compartan un cálculo sin tener que pasárselo a mano por media docena de
 * componentes.
 */
export const dailyLookFor = cache(async (userId: string) => {
  const supabase = await createClient()

  const { data: prefsRow } = await supabase
    .from('user_preferences')
    .select('lat, lon')
    .eq('user_id', userId)
    .maybeSingle()

  const prefs = (prefsRow ?? {}) as { lat?: number | null; lon?: number | null }

  // Si la API del tiempo falla, el motor compone sin temperatura (PLAN.md §35).
  const weather =
    prefs.lat != null && prefs.lon != null
      ? await fetchWeather({ lat: prefs.lat, lon: prefs.lon })
      : null

  const look = await getDailyLook(supabase, userId, weather)

  // El tiempo sale junto al look porque la cabecera lo enseña en la esquina y
  // ya está pagado: pedirlo otra vez desde allí sería una segunda llamada a la
  // API del tiempo para el mismo dato.
  return { look, weather }
})
