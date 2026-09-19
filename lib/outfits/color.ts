import type { Color } from '@/lib/wardrobe/taxonomy'

/**
 * Armonía de color.
 *
 * Es el componente que más pesa, porque es lo primero que ve cualquiera al mirar
 * un look. También es lo que un modelo de lenguaje haría peor y más caro: esto
 * son reglas que cualquier manual de estilismo recoge, no razonamiento.
 *
 * El modelo que se usa es el habitual: neutros que combinan con todo, un color
 * protagonista, y como mucho un segundo que armonice con él.
 */

/**
 * Los neutros combinan entre sí y con cualquier acento.
 * Azul marino y marrón entran aquí: en ropa funcionan como neutros, aunque en
 * una rueda de color no lo parezcan.
 */
const NEUTRALS: ReadonlySet<string> = new Set([
  'black', 'white', 'grey', 'navy', 'beige', 'cream', 'brown', 'silver',
])

/**
 * Posición en la rueda de color, en grados. Solo para los acentos.
 * Sirve para saber si dos colores son vecinos, opuestos o simplemente chocan.
 */
const HUE: Record<string, number> = {
  red: 0,
  burgundy: 350,
  pink: 340,
  orange: 25,
  gold: 45,
  yellow: 55,
  olive: 80,
  green: 130,
  light_blue: 200,
  blue: 215,
  purple: 280,
}

export function isNeutral(color: string): boolean {
  return NEUTRALS.has(color)
}

/** Distancia angular entre dos tonos, de 0 a 180 grados. */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * Cómo de bien conviven dos acentos, de 0 a 1.
 *
 * Vecinos en la rueda (análogos) y opuestos (complementarios) funcionan.
 * Lo que chirría es el medio: dos colores lo bastante distintos como para pelearse
 * pero no tanto como para que la oposición parezca intencionada.
 */
export function accentHarmony(a: string, b: string): number {
  if (a === b) return 1

  const hueA = HUE[a]
  const hueB = HUE[b]
  // Un multicolor ya trae su propia combinación: mejor no añadirle nada.
  if (hueA === undefined || hueB === undefined) return 0.4

  const distance = hueDistance(hueA, hueB)

  if (distance <= 40) return 0.85 // análogos
  if (distance <= 60) return 0.6
  if (distance >= 150) return 0.8 // complementarios
  return 0.35 // zona de conflicto
}

export interface ColorAnalysis {
  score: number
  neutrals: string[]
  accents: string[]
  /** Descripción corta del porqué, para las explicaciones de la Fase 6. */
  note: string | null
}

/**
 * Puntúa la paleta de un outfit.
 *
 * Los colores secundarios cuentan como presencia, pero no definen el look: una
 * camisa blanca con una raya roja fina no convierte el conjunto en rojo.
 */
export function analyzePalette(
  items: ReadonlyArray<{ primary_color: Color; secondary_colors?: readonly Color[] }>,
): ColorAnalysis {
  if (items.length === 0) {
    return { score: 0, neutrals: [], accents: [], note: null }
  }

  const primaries = items.map((item) => item.primary_color as string)
  const neutrals = [...new Set(primaries.filter(isNeutral))]
  const accents = [...new Set(primaries.filter((c) => !isNeutral(c)))]

  // Todo del mismo color: un monocromo es una decisión, no un accidente.
  const unique = new Set(primaries)
  if (unique.size === 1) {
    return {
      score: 0.9,
      neutrals,
      accents,
      note: isNeutral(primaries[0]!) ? 'paleta monocroma' : 'monocromo en un color fuerte',
    }
  }

  if (accents.length === 0) {
    // Solo neutros: nunca falla, pero tampoco dice mucho.
    return { score: 0.82, neutrals, accents, note: 'todo en neutros' }
  }

  if (accents.length === 1) {
    return {
      score: 1,
      neutrals,
      accents,
      note: neutrals.length > 0 ? 'un color sobre base neutra' : null,
    }
  }

  if (accents.length === 2) {
    const harmony = accentHarmony(accents[0]!, accents[1]!)
    return {
      score: Number((0.35 + harmony * 0.55).toFixed(4)),
      neutrals,
      accents,
      note: harmony >= 0.8 ? 'dos colores que se llevan bien' : null,
    }
  }

  // Tres o más acentos: se descarta casi siempre, pero no del todo. Con la
  // combinación adecuada puede funcionar, y el motor no debería ser dogmático.
  return { score: 0.2, neutrals, accents, note: null }
}

/**
 * Penalización por exceso de estampados.
 *
 * Mezclar dos estampados es algo que se puede hacer muy bien o muy mal, y el
 * sistema no tiene criterio para distinguirlo. Ante la duda, no lo propone.
 */
export function patternPenalty(patterns: readonly string[]): number {
  const loud = patterns.filter((p) => p !== 'solid' && p !== 'denim')
  if (loud.length <= 1) return 0
  if (loud.length === 2) return 0.15
  return 0.3
}
