import { describe, it, expect } from 'vitest'
import { nameOutfit, explainFromHighlights } from '@/lib/outfits/name'
import { findPairings, type PairCandidate } from '@/lib/wardrobe/pairs'
import type { WardrobeItem } from '@/lib/outfits/types'
import type { Category, Color } from '@/lib/wardrobe/taxonomy'

/**
 * Titulares y parejas.
 *
 * Las dos piezas nuevas que hicieron falta para el rediseño: la portada enseña
 * un look con nombre y la ficha de prenda enseña con qué combina. Las dos son
 * funciones puras y las dos tienen que funcionar **sin IA**, porque se usan en
 * pantallas que se abren todos los días.
 */

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

describe('nombre de un look', () => {
  it('nombra una paleta de neutros', () => {
    const name = nameOutfit([
      item({ primary_color: 'black' as Color }),
      item({ category: 'jeans' as Category, primary_color: 'grey' as Color }),
      item({ category: 'sneakers' as Category, primary_color: 'white' as Color }),
    ])
    expect(name).toBe('Neutros')
  })

  it('menciona el abrigo cuando lo hay', () => {
    const name = nameOutfit([
      item({ primary_color: 'black' as Color }),
      item({ category: 'jeans' as Category, primary_color: 'grey' as Color }),
      item({ category: 'jacket' as Category, primary_color: 'beige' as Color }),
    ])
    expect(name).toContain('chaqueta')
  })

  it('nunca devuelve una cadena vacía', () => {
    // La portada lo pone detrás de "Hoy te veo en…": un hueco ahí canta mucho.
    expect(nameOutfit([])).toBeTruthy()
    expect(nameOutfit([item({ primary_color: 'red' as Color, formality: 5 })])).toBeTruthy()
  })

  it('todos los nombres encajan detrás de "en"', () => {
    /*
     * El titular de la portada es "Hoy te veo **en** <nombre>". Un nombre que
     * empiece por preposición o por verbo daría "en con una chaqueta". Este
     * test recorre las salidas posibles en vez de confiar en que nadie añada
     * una nueva sin pensarlo.
     */
    const combinaciones: WardrobeItem[][] = [
      [item({ primary_color: 'black' as Color })],
      [item({ primary_color: 'red' as Color }), item({ category: 'jeans' as Category, primary_color: 'green' as Color })],
      [item({ category: 'coat' as Category, primary_color: 'red' as Color, formality: 4 })],
      [item({ category: 'blazer' as Category, primary_color: 'navy' as Color, formality: 5 })],
      [item({ formality: 1, primary_color: 'orange' as Color, pattern: 'floral' })],
    ]

    const prohibidos = ['con ', 'en ', 'y ', 'de ']
    for (const items of combinaciones) {
      const nombre = nameOutfit(items).toLowerCase()
      for (const inicio of prohibidos) {
        expect(nombre.startsWith(inicio), `"${nombre}" no puede ir tras "en"`).toBe(false)
      }
    }
  })
})

describe('explicación a partir de los motivos', () => {
  it('encadena varios motivos con puntuación', () => {
    const frase = explainFromHighlights(['todo en neutros', 'aguanta la lluvia'])
    expect(frase).toBe('Todo en neutros y aguanta la lluvia.')
  })

  it('con un solo motivo no inventa conjunción', () => {
    expect(explainFromHighlights(['aguanta la lluvia'])).toBe('Aguanta la lluvia.')
  })

  it('sin motivos no dice nada', () => {
    // Preferible a una frase de relleno: la tarjeta funciona sin ella.
    expect(explainFromHighlights([])).toBeNull()
  })
})

// ---------------------------------------------------------------------------

function pair(over: Partial<PairCandidate> = {}): PairCandidate {
  counter++
  return {
    id: over.id ?? `pair-${counter}`,
    category: 'tshirt',
    primary_color: 'black',
    secondary_colors: [],
    styles: ['casual'],
    formality: 3,
    image_path: null,
    is_available: true,
    ...over,
  }
}

describe('con qué combina una prenda', () => {
  const camiseta = pair({ id: 'camiseta', category: 'tshirt', primary_color: 'black' })

  it('nunca se propone a sí misma', () => {
    const result = findPairings(camiseta, [camiseta])
    expect(result).toHaveLength(0)
  })

  it('no propone prendas de la misma capa', () => {
    // Dos camisetas no combinan: se elige una.
    const otra = pair({ id: 'otra', category: 'shirt' })
    expect(findPairings(camiseta, [camiseta, otra])).toHaveLength(0)
  })

  it('ignora lo que está guardado', () => {
    const guardado = pair({ id: 'guardado', category: 'jeans', is_available: false })
    expect(findPairings(camiseta, [camiseta, guardado])).toHaveLength(0)
  })

  it('prefiere una prenda de cada capa antes que repetir', () => {
    /*
     * Cuatro pantalones casi idénticos llenarían la fila sin decir nada. Lo
     * útil es ver con qué *tipo* de prenda funciona.
     */
    const wardrobe = [
      camiseta,
      pair({ id: 'p1', category: 'jeans', primary_color: 'navy' }),
      pair({ id: 'p2', category: 'jeans', primary_color: 'navy' }),
      pair({ id: 'p3', category: 'chinos', primary_color: 'beige' }),
      pair({ id: 'z1', category: 'sneakers', primary_color: 'white' }),
    ]

    const result = findPairings(camiseta, wardrobe, 2)
    const categorias = result.map((r) => r.category)
    expect(categorias).toContain('sneakers')
    expect(result).toHaveLength(2)
  })

  it('castiga las parejas con formalidad incompatible', () => {
    const vaqueros = pair({ id: 'vaqueros', category: 'jeans', primary_color: 'navy', formality: 2 })
    const vestir = pair({ id: 'vestir', category: 'trousers', primary_color: 'navy', formality: 5 })

    const informal = pair({ id: 'informal', category: 'tshirt', formality: 1, primary_color: 'grey' })
    const result = findPairings(informal, [informal, vaqueros, vestir], 1)

    expect(result[0]?.id).toBe('vaqueros')
  })
})
