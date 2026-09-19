/**
 * Clima.
 *
 * Se usa Open-Meteo: gratis, sin registro, sin clave y sin tarjeta. Para lo que
 * necesitamos —temperatura y si llueve— cualquier otro proveedor añadiría una
 * clave que gestionar sin aportar nada.
 *
 * El clima entra al motor como dato estructurado, nunca como texto para que lo
 * interprete un modelo: decidir que con 8 grados y lluvia hace falta abrigo es
 * una tabla, no razonamiento (PLAN.md §25).
 */

export interface Weather {
  temperatureC: number
  feelsLikeC: number
  rain: boolean
  windKmh: number
  /** Código WMO, por si algún día se quiere un icono. */
  code: number
  description: string
  /** De dónde salió: sirve para decírselo a la persona con honestidad. */
  source: 'api' | 'manual'
}

export interface Coordinates {
  lat: number
  lon: number
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'

/**
 * Caché en memoria.
 *
 * El tiempo no cambia en quince minutos, y sin esto cada vez que alguien abre la
 * pantalla se pide de nuevo. Es por instancia del servidor, lo cual basta: no
 * hace falta montar Redis para ahorrar una llamada a una API gratuita.
 */
const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, { weather: Weather; at: number }>()

function cacheKey({ lat, lon }: Coordinates): string {
  // Redondear a dos decimales agrupa las peticiones de un mismo barrio.
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

/** Descripciones WMO, resumidas a lo que una persona diría. */
const WMO: Record<number, string> = {
  0: 'Despejado',
  1: 'Poco nuboso',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  48: 'Niebla helada',
  51: 'Llovizna',
  53: 'Llovizna',
  55: 'Llovizna intensa',
  61: 'Lluvia débil',
  63: 'Lluvia',
  65: 'Lluvia fuerte',
  66: 'Lluvia helada',
  67: 'Lluvia helada',
  71: 'Nieve débil',
  73: 'Nieve',
  75: 'Nieve intensa',
  77: 'Aguanieve',
  80: 'Chubascos',
  81: 'Chubascos',
  82: 'Chubascos fuertes',
  85: 'Chubascos de nieve',
  86: 'Chubascos de nieve',
  95: 'Tormenta',
  96: 'Tormenta con granizo',
  99: 'Tormenta con granizo',
}

/** Códigos WMO que implican agua cayendo. */
function isRainy(code: number, precipitation: number): boolean {
  if (precipitation > 0.1) return true
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  )
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    precipitation?: number
    weather_code?: number
    wind_speed_10m?: number
  }
  error?: boolean
  reason?: string
}

/**
 * Tiempo actual en unas coordenadas.
 *
 * Devuelve `null` si falla, nunca lanza: quien llama ofrece meter la temperatura
 * a mano y la aplicación sigue funcionando (PLAN.md §35).
 */
export async function fetchWeather(coords: Coordinates): Promise<Weather | null> {
  const key = cacheKey(coords)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.weather

  try {
    const url = new URL(FORECAST_URL)
    url.searchParams.set('latitude', String(coords.lat))
    url.searchParams.set('longitude', String(coords.lon))
    url.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    )
    url.searchParams.set('timezone', 'auto')

    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 900 },
    })
    if (!response.ok) return null

    const json = (await response.json()) as OpenMeteoResponse
    const current = json.current
    if (!current || typeof current.temperature_2m !== 'number') return null

    const code = current.weather_code ?? 0
    const weather: Weather = {
      temperatureC: Math.round(current.temperature_2m),
      feelsLikeC: Math.round(current.apparent_temperature ?? current.temperature_2m),
      rain: isRainy(code, current.precipitation ?? 0),
      windKmh: Math.round(current.wind_speed_10m ?? 0),
      code,
      description: WMO[code] ?? 'Sin datos',
      source: 'api',
    }

    cache.set(key, { weather, at: Date.now() })
    return weather
  } catch (err) {
    console.error('[clima] no se ha podido consultar:', err)
    return null
  }
}

export interface ForecastDay {
  /** `YYYY-MM-DD`. */
  date: string
  maxC: number
  minC: number
  rain: boolean
  code: number
  description: string
}

interface ForecastResponse {
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
    weather_code?: number[]
  }
}

/**
 * Previsión de los próximos días. Para la maleta.
 *
 * Devuelve lista vacía si falla: quien llama usa una temperatura fija y el viaje
 * se planifica igual, solo que con menos precisión.
 */
export async function fetchForecast(
  coords: Coordinates,
  days = 7,
): Promise<ForecastDay[]> {
  try {
    const url = new URL(FORECAST_URL)
    url.searchParams.set('latitude', String(coords.lat))
    url.searchParams.set('longitude', String(coords.lon))
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
    )
    url.searchParams.set('forecast_days', String(Math.min(16, Math.max(1, days))))
    url.searchParams.set('timezone', 'auto')

    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    })
    if (!response.ok) return []

    const json = (await response.json()) as ForecastResponse
    const daily = json.daily
    if (!daily?.time || !daily.temperature_2m_max) return []

    return daily.time.map((date, i) => {
      const code = daily.weather_code?.[i] ?? 0
      const max = daily.temperature_2m_max?.[i] ?? 18
      const min = daily.temperature_2m_min?.[i] ?? max - 6
      return {
        date,
        maxC: Math.round(max),
        minC: Math.round(min),
        rain: isRainy(code, daily.precipitation_sum?.[i] ?? 0),
        code,
        description: WMO[code] ?? 'Sin datos',
      }
    })
  } catch (err) {
    console.error('[clima] previsión fallida:', err)
    return []
  }
}

/** Construye un `Weather` a partir de lo que la persona escriba a mano. */
export function manualWeather(temperatureC: number, rain: boolean): Weather {
  return {
    temperatureC,
    feelsLikeC: temperatureC,
    rain,
    windKmh: 0,
    code: rain ? 63 : 1,
    description: rain ? 'Lluvia' : 'Sin datos',
    source: 'manual',
  }
}

// ---------------------------------------------------------------------------
// Geocodificación
// ---------------------------------------------------------------------------

export interface Place {
  name: string
  region: string | null
  country: string | null
  lat: number
  lon: number
}

interface GeocodeResponse {
  results?: Array<{
    name: string
    admin1?: string
    country?: string
    latitude: number
    longitude: number
  }>
}

/** Busca una ciudad por nombre. Devuelve lista vacía si falla. */
export async function searchPlaces(query: string, limit = 5): Promise<Place[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  try {
    const url = new URL(GEOCODE_URL)
    url.searchParams.set('name', trimmed)
    url.searchParams.set('count', String(limit))
    url.searchParams.set('language', 'es')
    url.searchParams.set('format', 'json')

    const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!response.ok) return []

    const json = (await response.json()) as GeocodeResponse
    return (json.results ?? []).map((result) => ({
      name: result.name,
      region: result.admin1 ?? null,
      country: result.country ?? null,
      lat: result.latitude,
      lon: result.longitude,
    }))
  } catch (err) {
    console.error('[clima] geocodificación fallida:', err)
    return []
  }
}

/** Solo para los tests: vacía la caché entre casos. */
export function clearWeatherCache() {
  cache.clear()
}
