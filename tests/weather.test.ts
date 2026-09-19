import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchWeather, manualWeather, searchPlaces, clearWeatherCache } from '@/lib/weather/provider'

/**
 * El clima es un dato estructurado que entra al motor, no un texto que
 * interprete nadie (PLAN.md §25). Y cuando la API falla, la aplicación tiene que
 * seguir funcionando con lo que escriba la persona (§35).
 */

const MADRID = { lat: 40.42, lon: -3.7 }

function respondWith(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  } as Response)
}

describe('fetchWeather', () => {
  beforeEach(() => clearWeatherCache())
  afterEach(() => vi.unstubAllGlobals())

  it('convierte la respuesta de la API en datos utilizables', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({
        current: {
          temperature_2m: 18.4,
          apparent_temperature: 17.2,
          precipitation: 0,
          weather_code: 3,
          wind_speed_10m: 12.6,
        },
      }),
    )

    const weather = await fetchWeather(MADRID)

    expect(weather).not.toBeNull()
    expect(weather!.temperatureC).toBe(18) // redondeado: los decimales no aportan
    expect(weather!.rain).toBe(false)
    expect(weather!.description).toBe('Nublado')
    expect(weather!.source).toBe('api')
  })

  it('detecta lluvia por el código aunque la precipitación venga a cero', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({
        current: { temperature_2m: 12, precipitation: 0, weather_code: 61 },
      }),
    )
    expect((await fetchWeather(MADRID))!.rain).toBe(true)
  })

  it('detecta lluvia por precipitación aunque el código no lo diga', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({
        current: { temperature_2m: 12, precipitation: 0.8, weather_code: 3 },
      }),
    )
    expect((await fetchWeather(MADRID))!.rain).toBe(true)
  })

  it('una tormenta cuenta como lluvia', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({ current: { temperature_2m: 20, precipitation: 0, weather_code: 95 } }),
    )
    expect((await fetchWeather(MADRID))!.rain).toBe(true)
  })

  it('devuelve null si la API falla, en vez de lanzar', async () => {
    vi.stubGlobal('fetch', respondWith({ error: true }, false))
    expect(await fetchWeather(MADRID)).toBeNull()
  })

  it('devuelve null si la red se cae, en vez de lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')))
    expect(await fetchWeather(MADRID)).toBeNull()
  })

  it('devuelve null si la respuesta viene incompleta', async () => {
    vi.stubGlobal('fetch', respondWith({ current: {} }))
    expect(await fetchWeather(MADRID)).toBeNull()
  })

  it('cachea: no consulta dos veces el mismo sitio seguido', async () => {
    const mock = respondWith({
      current: { temperature_2m: 15, precipitation: 0, weather_code: 0 },
    })
    vi.stubGlobal('fetch', mock)

    await fetchWeather(MADRID)
    await fetchWeather(MADRID)

    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('agrupa coordenadas del mismo barrio en una sola consulta', async () => {
    const mock = respondWith({
      current: { temperature_2m: 15, precipitation: 0, weather_code: 0 },
    })
    vi.stubGlobal('fetch', mock)

    await fetchWeather({ lat: 40.4201, lon: -3.7001 })
    await fetchWeather({ lat: 40.4203, lon: -3.7004 })

    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('no cachea un fallo: la siguiente vez se vuelve a intentar', async () => {
    const mock = vi.fn().mockRejectedValue(new Error('sin red'))
    vi.stubGlobal('fetch', mock)

    await fetchWeather(MADRID)
    await fetchWeather(MADRID)

    expect(mock).toHaveBeenCalledTimes(2)
  })
})

describe('manualWeather', () => {
  it('construye un clima válido con lo que escriba la persona', () => {
    const weather = manualWeather(8, true)
    expect(weather.temperatureC).toBe(8)
    expect(weather.rain).toBe(true)
    expect(weather.source).toBe('manual')
  })

  it('deja claro que el dato no viene de la API', () => {
    expect(manualWeather(20, false).source).toBe('manual')
  })
})

describe('searchPlaces', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('devuelve lugares con coordenadas', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith({
        results: [
          { name: 'Madrid', admin1: 'Madrid', country: 'España', latitude: 40.42, longitude: -3.7 },
        ],
      }),
    )

    const places = await searchPlaces('Madrid')
    expect(places).toHaveLength(1)
    expect(places[0]?.lat).toBeCloseTo(40.42, 2)
  })

  it('no consulta con menos de dos letras', async () => {
    const mock = respondWith({ results: [] })
    vi.stubGlobal('fetch', mock)

    expect(await searchPlaces('a')).toEqual([])
    expect(mock).not.toHaveBeenCalled()
  })

  it('devuelve lista vacía si falla, en vez de lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')))
    expect(await searchPlaces('Madrid')).toEqual([])
  })

  it('aguanta una respuesta sin resultados', async () => {
    vi.stubGlobal('fetch', respondWith({}))
    expect(await searchPlaces('Zzzzz')).toEqual([])
  })
})
