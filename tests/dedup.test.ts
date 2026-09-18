import { describe, it, expect } from 'vitest'
import {
  similarity,
  decideMatch,
  DEDUP_THRESHOLDS,
  type ComparableGarment,
  type ExistingItem,
} from '@/lib/wardrobe/dedup'

function garment(over: Partial<ComparableGarment> = {}): ComparableGarment {
  return {
    category: 'tshirt',
    primary_color: 'black',
    secondary_colors: [],
    pattern: 'solid',
    fit: 'oversized',
    material: 'cotton',
    ...over,
  }
}

function existing(id: string, over: Partial<ComparableGarment> = {}): ExistingItem {
  return { id, ...garment(over) }
}

describe('similarity', () => {
  it('una prenda es idéntica a sí misma', () => {
    expect(similarity(garment(), garment())).toBe(1)
  })

  it('categorías distintas nunca se parecen, por mucho que coincida el resto', () => {
    // Esto es lo que impide fusionar una camiseta negra con una chaqueta negra.
    expect(similarity(garment(), garment({ category: 'jacket' }))).toBe(0)
  })

  it('el color es lo que más pesa', () => {
    const otroColor = similarity(garment(), garment({ primary_color: 'red' }))
    const otroMaterial = similarity(garment(), garment({ material: 'linen' }))
    expect(otroColor).toBeLessThan(otroMaterial)
  })

  it('da crédito parcial a colores que se confunden con la luz', () => {
    const cercano = similarity(garment(), garment({ primary_color: 'grey' }))
    const lejano = similarity(garment(), garment({ primary_color: 'yellow' }))
    expect(cercano).toBeGreaterThan(lejano)
  })

  it('un atributo desconocido no penaliza como uno contradictorio', () => {
    const desconocido = similarity(garment(), garment({ fit: 'unknown' }))
    const contrario = similarity(garment(), garment({ fit: 'skinny' }))
    expect(desconocido).toBeGreaterThan(contrario)
  })

  it('es simétrica', () => {
    const a = garment()
    const b = garment({ primary_color: 'navy', fit: 'unknown' })
    expect(similarity(a, b)).toBe(similarity(b, a))
  })

  it('nunca se sale de 0–1', () => {
    const combinaciones: ComparableGarment[] = [
      garment(),
      garment({ primary_color: 'multicolor', secondary_colors: ['red', 'blue'] }),
      garment({ category: 'boots', material: 'leather', fit: 'regular' }),
    ]
    for (const a of combinaciones) {
      for (const b of combinaciones) {
        const s = similarity(a, b)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('decideMatch', () => {
  it('con el armario vacío, todo es prenda nueva', () => {
    const d = decideMatch(garment(), [], 0.9)
    expect(d.kind).toBe('new_item')
    expect(d.needsReview).toBe(false)
  })

  it('fusiona sin preguntar cuando es evidentemente la misma prenda', () => {
    const d = decideMatch(garment(), [existing('item-1')], 0.95)
    expect(d.kind).toBe('auto_merged')
    expect(d.existingId).toBe('item-1')
  })

  it('pregunta cuando se parecen pero no lo suficiente', () => {
    // Misma camiseta negra, pero un corte distinto: ¿dos camisetas o una mal vista?
    const d = decideMatch(garment({ fit: 'regular' }), [existing('item-1')], 0.9)
    expect(d.kind).toBe('needs_confirmation')
    expect(d.existingId).toBe('item-1')
    expect(d.needsReview).toBe(true)
  })

  it('NUNCA fusiona en silencio si la IA vio mal la prenda', () => {
    // El caso peligroso: atributos idénticos pero lectura dudosa. Si se fusionara,
    // el usuario perdería una prenda del armario sin enterarse.
    const d = decideMatch(garment(), [existing('item-1')], 0.4)
    expect(d.kind).toBe('needs_confirmation')
  })

  it('una prenda nueva mal vista entra, pero marcada para revisar', () => {
    const d = decideMatch(garment({ category: 'boots' }), [existing('item-1')], 0.4)
    expect(d.kind).toBe('new_item')
    expect(d.needsReview).toBe(true)
  })

  it('elige la prenda más parecida cuando hay varias candidatas', () => {
    const candidatas = [
      existing('lejana', { primary_color: 'red' }),
      existing('exacta'),
      existing('media', { fit: 'regular' }),
    ]
    const d = decideMatch(garment(), candidatas, 0.95)
    expect(d.existingId).toBe('exacta')
  })

  it('no confunde dos camisetas negras distintas de verdad', () => {
    // Misma categoría y color, pero corte y estampado distintos.
    const otra = existing('otra', { fit: 'skinny', pattern: 'graphic' })
    const d = decideMatch(garment(), [otra], 0.9)
    expect(d.kind).toBe('new_item')
  })

  it('los umbrales están ordenados y son estrictos', () => {
    expect(DEDUP_THRESHOLDS.autoMerge).toBeGreaterThan(DEDUP_THRESHOLDS.ask)
    // Fusionar a ciegas es el error caro: el listón tiene que estar alto.
    expect(DEDUP_THRESHOLDS.autoMerge).toBeGreaterThanOrEqual(0.9)
  })
})
