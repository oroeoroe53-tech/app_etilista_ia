import { COLORS, LAYERS, SEASONS, type Color, type Layer, type Season } from './taxonomy'

/**
 * Filtros del armario.
 *
 * Viven en la URL y no en el estado de React: así la pestaña se puede compartir,
 * el botón de atrás funciona como la gente espera, y la página se puede renderizar
 * en el servidor sin hidratar una lista entera de prendas.
 *
 * Los valores llegan de la barra de direcciones, así que son entrada no fiable:
 * todo lo que no esté en la taxonomía se descarta en silencio en lugar de acabar
 * en una consulta.
 */

export interface WardrobeFilters {
  layer: Layer | null
  color: Color | null
  season: Season | null
  /** `null` = todas · `true` = solo disponibles · `false` = solo guardadas. */
  available: boolean | null
}

export const EMPTY_FILTERS: WardrobeFilters = {
  layer: null,
  color: null,
  season: null,
  available: null,
}

/** Nombres en castellano para que la URL se lea bien. */
const PARAM = {
  layer: 'capa',
  color: 'color',
  season: 'temporada',
  available: 'estado',
} as const

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  if (!value) return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

export function parseFilters(params: Record<string, string | string[] | undefined>): WardrobeFilters {
  const single = (key: string): string | undefined => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const estado = single(PARAM.available)

  return {
    layer: pick(single(PARAM.layer), LAYERS),
    color: pick(single(PARAM.color), COLORS),
    season: pick(single(PARAM.season), SEASONS),
    available: estado === 'disponibles' ? true : estado === 'guardadas' ? false : null,
  }
}

/** Construye la query string. Un filtro vacío no aparece: URLs cortas y legibles. */
export function buildQuery(filters: WardrobeFilters): string {
  const params = new URLSearchParams()
  if (filters.layer) params.set(PARAM.layer, filters.layer)
  if (filters.color) params.set(PARAM.color, filters.color)
  if (filters.season) params.set(PARAM.season, filters.season)
  if (filters.available === true) params.set(PARAM.available, 'disponibles')
  if (filters.available === false) params.set(PARAM.available, 'guardadas')

  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Activa o desactiva un filtro. Volver a pulsar el que ya estaba lo quita. */
export function toggleFilter<K extends keyof WardrobeFilters>(
  filters: WardrobeFilters,
  key: K,
  value: WardrobeFilters[K],
): WardrobeFilters {
  return { ...filters, [key]: filters[key] === value ? null : value }
}

export function hasAnyFilter(filters: WardrobeFilters): boolean {
  return Object.values(filters).some((value) => value !== null)
}

export function countActive(filters: WardrobeFilters): number {
  return Object.values(filters).filter((value) => value !== null).length
}
