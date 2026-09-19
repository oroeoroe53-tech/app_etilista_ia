import { describe, it, expect } from 'vitest'
import { planPacking } from '@/lib/outfits/packing'
import { emptyProfile } from '@/lib/style/profile'
import type { WardrobeItem } from '@/lib/outfits/types'
import type { Category, Color } from '@/lib/wardrobe/taxonomy'

const TODAY = new Date('2026-09-19T12:00:00Z')

let counter = 0
function item(over: Partial<WardrobeItem> = {}): WardrobeItem {
  counter++
  return {
    id: over.id ?? `item-${counter}`,
    category: 'tshirt' as Category,
    primary_color: 'black' as Color,
    secondary_colors: [],
    pattern: 'solid',
    fit: 'regular',
    material: 'cotton',
    styles: ['casual'],
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    formality: 3,
    warmth: 2,
    is_available: true,
    last_worn_at: null,
    times_worn: 0,
    ...over,
  } as WardrobeItem
}

function wardrobe(): WardrobeItem[] {
  return [
    item({ id: 't1', category: 'tshirt', primary_color: 'black' }),
    item({ id: 't2', category: 'tshirt', primary_color: 'white' }),
    item({ id: 't3', category: 'shirt', primary_color: 'white', formality: 4 }),
    item({ id: 't4', category: 'polo', primary_color: 'navy' }),
    item({ id: 'b1', category: 'jeans', primary_color: 'navy', warmth: 3 }),
    item({ id: 'b2', category: 'chinos', primary_color: 'beige', formality: 4 }),
    item({ id: 'b3', category: 'trousers', primary_color: 'black', formality: 4 }),
    item({ id: 's1', category: 'sneakers', primary_color: 'white' }),
    item({ id: 's2', category: 'shoes', primary_color: 'brown', formality: 4 }),
    item({ id: 'o1', category: 'jacket', primary_color: 'olive', warmth: 4 }),
  ]
}

const day = (over = {}) => ({ temperatureC: 20, today: TODAY, ...over })

describe('la maleta', () => {
  it('propone un look por día', () => {
    const result = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: [day(), day(), day(), day()],
    })

    expect(result.emptyReason).toBeNull()
    expect(result.days).toHaveLength(4)
  })

  it('mete menos prendas de las que usaría un look distinto cada día', () => {
    // Es la razón de ser de esta función: cuatro días no son cuatro conjuntos.
    const dias = [day(), day(), day(), day()]
    const result = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: dias,
    })

    const prendasSiNoSeRepitiera = result.days.reduce((sum, d) => sum + d.outfit.items.length, 0)
    expect(result.items.length).toBeLessThan(prendasSiNoSeRepitiera)
  })

  it('reutiliza prendas entre días', () => {
    const result = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: [day(), day(), day(), day(), day()],
    })
    expect(result.reusedCount).toBeGreaterThan(0)
  })

  it('cuantos más días, mejor aprovecha la maleta', () => {
    const corto = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: [day(), day()],
    })
    const largo = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: Array.from({ length: 7 }, () => day()),
    })

    const prendasPorDiaCorto = corto.items.length / corto.days.length
    const prendasPorDiaLargo = largo.items.length / largo.days.length

    expect(prendasPorDiaLargo).toBeLessThan(prendasPorDiaCorto)
  })

  it('no repite el look exacto dos días seguidos', () => {
    const result = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: Array.from({ length: 5 }, () => day()),
    })

    const firmas = result.days.map((d) =>
      d.outfit.items.map((i) => i.id).sort().join('|'),
    )
    for (let i = 1; i < firmas.length; i++) {
      expect(firmas[i]).not.toBe(firmas[i - 1])
    }
  })

  it('se adapta si cambia el tiempo durante el viaje', () => {
    const result = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: [day({ temperatureC: 26 }), day({ temperatureC: 26 }), day({ temperatureC: 6 })],
    })

    const diaFrio = result.days.find((d) => d.context.temperatureC === 6)
    expect(diaFrio?.outfit.items.some((i) => i.warmth >= 4)).toBe(true)
  })

  it('la lista de prendas no tiene duplicados', () => {
    const result = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: Array.from({ length: 6 }, () => day()),
    })

    const ids = result.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('toda prenda de un look va en la maleta', () => {
    const result = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: [day(), day(), day()],
    })

    const enMaleta = new Set(result.items.map((i) => i.id))
    for (const d of result.days) {
      for (const prenda of d.outfit.items) {
        expect(enMaleta.has(prenda.id)).toBe(true)
      }
    }
  })

  it('con el armario vacío lo dice', () => {
    const result = planPacking({
      wardrobe: [],
      profile: emptyProfile(),
      days: [day()],
    })
    expect(result.emptyReason).toBe('no_wardrobe')
  })

  it('sin días no devuelve nada, pero tampoco falla', () => {
    const result = planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: [],
    })
    expect(result.days).toHaveLength(0)
    expect(result.emptyReason).toBeNull()
  })

  it('es determinista', () => {
    const input = {
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: [day(), day(), day()],
    }
    const a = planPacking(input)
    const b = planPacking(input)

    expect(a.items.map((i) => i.id).sort()).toEqual(b.items.map((i) => i.id).sort())
  })

  it('un viaje largo no tarda una eternidad', () => {
    const started = Date.now()
    planPacking({
      wardrobe: wardrobe(),
      profile: emptyProfile(),
      days: Array.from({ length: 14 }, () => day()),
    })
    expect(Date.now() - started).toBeLessThan(3000)
  })
})
