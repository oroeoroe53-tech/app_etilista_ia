import { describe, it, expect } from 'vitest'
import {
  parseFilters,
  buildQuery,
  toggleFilter,
  hasAnyFilter,
  countActive,
  EMPTY_FILTERS,
} from '@/lib/wardrobe/filters'

/**
 * Los filtros viven en la URL, así que llegan de la barra de direcciones: son
 * entrada no fiable. Nada que no esté en la taxonomía debe llegar a una consulta.
 */
describe('parseFilters', () => {
  it('sin parámetros, no hay filtros', () => {
    expect(parseFilters({})).toEqual(EMPTY_FILTERS)
  })

  it('lee los valores válidos', () => {
    const f = parseFilters({ capa: 'top', color: 'black', temporada: 'winter' })
    expect(f.layer).toBe('top')
    expect(f.color).toBe('black')
    expect(f.season).toBe('winter')
  })

  it('descarta en silencio lo que alguien escriba a mano en la URL', () => {
    const f = parseFilters({ capa: 'sombrero', color: 'DROP TABLE', temporada: '2026' })
    expect(f.layer).toBeNull()
    expect(f.color).toBeNull()
    expect(f.season).toBeNull()
  })

  it('entiende el estado de disponibilidad', () => {
    expect(parseFilters({ estado: 'disponibles' }).available).toBe(true)
    expect(parseFilters({ estado: 'guardadas' }).available).toBe(false)
    expect(parseFilters({ estado: 'lo-que-sea' }).available).toBeNull()
  })

  it('se queda con el primer valor si el parámetro viene repetido', () => {
    expect(parseFilters({ color: ['black', 'red'] }).color).toBe('black')
  })
})

describe('buildQuery', () => {
  it('sin filtros devuelve cadena vacía, no un "?" suelto', () => {
    expect(buildQuery(EMPTY_FILTERS)).toBe('')
  })

  it('omite los filtros vacíos', () => {
    const query = buildQuery({ ...EMPTY_FILTERS, color: 'black' })
    expect(query).toBe('?color=black')
  })

  it('escribe el estado en palabras', () => {
    expect(buildQuery({ ...EMPTY_FILTERS, available: false })).toBe('?estado=guardadas')
  })

  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const original = { layer: 'outer', color: 'navy', season: 'winter', available: true } as const
    const query = buildQuery(original)
    const params = Object.fromEntries(new URLSearchParams(query.slice(1)))
    expect(parseFilters(params)).toEqual(original)
  })
})

describe('toggleFilter', () => {
  it('activa un filtro', () => {
    expect(toggleFilter(EMPTY_FILTERS, 'color', 'black').color).toBe('black')
  })

  it('volver a pulsar el mismo lo quita', () => {
    const conFiltro = { ...EMPTY_FILTERS, color: 'black' as const }
    expect(toggleFilter(conFiltro, 'color', 'black').color).toBeNull()
  })

  it('cambiar de valor sustituye, no acumula', () => {
    const conFiltro = { ...EMPTY_FILTERS, color: 'black' as const }
    expect(toggleFilter(conFiltro, 'color', 'red').color).toBe('red')
  })

  it('no toca los demás filtros', () => {
    const inicial = { ...EMPTY_FILTERS, layer: 'top' as const }
    const resultado = toggleFilter(inicial, 'color', 'red')
    expect(resultado.layer).toBe('top')
  })
})

describe('recuento', () => {
  it('detecta si hay alguno activo', () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false)
    expect(hasAnyFilter({ ...EMPTY_FILTERS, color: 'black' })).toBe(true)
  })

  it('cuenta los activos', () => {
    expect(countActive(EMPTY_FILTERS)).toBe(0)
    expect(countActive({ layer: 'top', color: 'black', season: null, available: true })).toBe(3)
  })

  it('"guardadas" cuenta como filtro activo aunque sea false', () => {
    // `false` es un valor elegido, no la ausencia de filtro: si no se distinguiera,
    // el botón de "quitar filtros" no aparecería al filtrar por guardadas.
    expect(hasAnyFilter({ ...EMPTY_FILTERS, available: false })).toBe(true)
  })
})
