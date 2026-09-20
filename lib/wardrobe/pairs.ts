import { analyzePalette } from '@/lib/outfits/color'
import { layerOf, type Category, type Color, type Layer } from './taxonomy'

/**
 * Con qué combina una prenda.
 *
 * La ficha de una prenda enseña cuatro compañeras. Esto no es el motor de
 * outfits en pequeño: es una comparación por parejas, que es una pregunta
 * distinta y mucho más barata.
 *
 * El motor monta conjuntos completos y tiene que equilibrar clima, ocasión,
 * repetición y diversidad. Aquí solo se pregunta "¿estas dos piezas se llevan
 * bien?", y para eso bastan el color, lo arreglado que va cada una y el estilo.
 * Correrlo entero para pintar cuatro miniaturas sería pagar mil veces más por
 * una respuesta que además no es la que se hace.
 *
 * Solo se proponen prendas de **otra capa**: dos camisetas no combinan, se
 * eligen.
 */

export interface PairCandidate {
  id: string
  category: string
  primary_color: string
  secondary_colors?: string[] | null
  styles?: string[] | null
  formality?: number | null
  image_path?: string | null
  is_available?: boolean
}

/** Qué capas tiene sentido enseñar junto a cada capa. */
const GOES_WITH: Record<Layer, Layer[]> = {
  top: ['bottom', 'footwear', 'outer', 'accessory'],
  bottom: ['top', 'footwear', 'outer', 'accessory'],
  full_body: ['footwear', 'outer', 'accessory'],
  outer: ['top', 'bottom', 'full_body', 'footwear'],
  footwear: ['bottom', 'top', 'full_body', 'outer'],
  accessory: ['top', 'bottom', 'full_body', 'outer'],
}

function styleOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0.5 // sin datos, ni suma ni resta
  const shared = a.filter((style) => b.includes(style)).length
  return shared / Math.max(a.length, b.length)
}

export function findPairings(
  item: PairCandidate,
  wardrobe: readonly PairCandidate[],
  limit = 4,
): PairCandidate[] {
  const layer = layerOf(item.category as Category)
  const wanted = GOES_WITH[layer] ?? []

  const scored = wardrobe
    .filter((other) => {
      if (other.id === item.id) return false
      if (other.is_available === false) return false
      return wanted.includes(layerOf(other.category as Category))
    })
    .map((other) => {
      const palette = analyzePalette([
        {
          primary_color: item.primary_color as Color,
          secondary_colors: (item.secondary_colors ?? []) as Color[],
        },
        {
          primary_color: other.primary_color as Color,
          secondary_colors: (other.secondary_colors ?? []) as Color[],
        },
      ])

      // Dos piezas con formalidad muy distinta no van juntas aunque el color
      // case: unos vaqueros con un esmoquin combinan de color y de nada más.
      const distance = Math.abs((item.formality ?? 3) - (other.formality ?? 3))
      const formality = Math.max(0, 1 - distance / 3)

      const style = styleOverlap(item.styles ?? [], other.styles ?? [])

      return { other, score: palette.score * 0.5 + formality * 0.3 + style * 0.2 }
    })
    .sort((a, b) => b.score - a.score)

  /*
   * Una de cada capa antes de repetir.
   *
   * Sin esto, cuatro pantalones negros que puntúan casi igual ocuparían los
   * cuatro huecos y la fila no diría nada: lo útil es ver con qué **tipo** de
   * prenda funciona, no cuál de los cuatro negros gana por dos centésimas.
   */
  const picked: PairCandidate[] = []
  const usedLayers = new Set<Layer>()

  for (const { other } of scored) {
    const otherLayer = layerOf(other.category as Category)
    if (usedLayers.has(otherLayer)) continue
    picked.push(other)
    usedLayers.add(otherLayer)
    if (picked.length >= limit) return picked
  }

  for (const { other } of scored) {
    if (picked.length >= limit) break
    if (!picked.includes(other)) picked.push(other)
  }

  return picked
}
