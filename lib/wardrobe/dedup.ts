import type { Category, Color, Fit, Material, Pattern } from './taxonomy'

/**
 * Deduplicación de prendas.
 *
 * El modelo ya agrupa las repeticiones DENTRO del lote de fotos: ve las seis
 * juntas y devuelve un `garment_group` por prenda (ver docs/AI.md). Lo que
 * resuelve este archivo es lo otro: si una prenda recién detectada **ya existe
 * en el armario** de antes.
 *
 * Pasa cada vez que alguien sube más fotos, o que había añadido prendas a mano.
 *
 * El criterio de fondo, y es una decisión de producto: ante la duda, NO fusionar.
 * Que el usuario junte dos fichas duplicadas cuesta un toque; que el sistema
 * fusione en silencio dos camisetas negras distintas le borra una prenda del
 * armario sin que se entere y sin forma de recuperarla.
 */

export interface ComparableGarment {
  category: Category
  primary_color: Color
  secondary_colors: readonly Color[]
  pattern: Pattern
  fit: Fit
  material: Material
}

export interface ExistingItem extends ComparableGarment {
  id: string
}

/**
 * Colores que se confunden con facilidad en una foto de móvil, según luz y
 * balance de blancos. Merecen crédito parcial, no cero.
 */
const NEAR_COLORS: Record<string, readonly string[]> = {
  black: ['grey'],
  grey: ['black', 'silver'],
  navy: ['blue', 'black'],
  blue: ['navy', 'light_blue'],
  light_blue: ['blue'],
  beige: ['cream', 'brown'],
  cream: ['beige', 'white'],
  white: ['cream'],
  brown: ['beige', 'burgundy'],
  burgundy: ['red', 'brown'],
  red: ['burgundy'],
  olive: ['green'],
  green: ['olive'],
  silver: ['grey'],
  gold: ['yellow'],
  yellow: ['gold'],
}

function colorScore(a: Color, b: Color): number {
  if (a === b) return 1
  // Se mira en los dos sentidos a propósito: el mapa de arriba se escribe a mano
  // y es fácil que quede cojo (negro→gris sin gris→negro). Si la comparación
  // dependiera del orden, `similarity(a, b)` y `similarity(b, a)` diferirían y
  // el resultado de la deduplicación dependería de en qué orden llegaron las fotos.
  if (NEAR_COLORS[a]?.includes(b) || NEAR_COLORS[b]?.includes(a)) return 0.5
  return 0
}

/** Igual → 1. Uno de los dos desconocido → crédito a medias. Distinto → 0. */
function optionalScore<T extends string>(a: T, b: T, unknown: T): number {
  if (a === b) return 1
  if (a === unknown || b === unknown) return 0.5
  return 0
}

const WEIGHTS = {
  color: 0.4,
  pattern: 0.2,
  fit: 0.2,
  material: 0.12,
  secondaryColors: 0.08,
} as const

/**
 * Parecido entre dos prendas, de 0 a 1.
 *
 * La categoría no puntúa: es eliminatoria. Una camiseta y una chaqueta no son
 * la misma prenda por mucho que coincidan en todo lo demás.
 */
export function similarity(a: ComparableGarment, b: ComparableGarment): number {
  if (a.category !== b.category) return 0

  const secondary =
    a.secondary_colors.length === 0 && b.secondary_colors.length === 0
      ? 1
      : overlap(a.secondary_colors, b.secondary_colors)

  const score =
    WEIGHTS.color * colorScore(a.primary_color, b.primary_color) +
    WEIGHTS.pattern * (a.pattern === b.pattern ? 1 : 0) +
    WEIGHTS.fit * optionalScore(a.fit, b.fit, 'unknown') +
    WEIGHTS.material * optionalScore(a.material, b.material, 'unknown') +
    WEIGHTS.secondaryColors * secondary

  return Number(score.toFixed(4))
}

function overlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b)
  const common = a.filter((x) => setB.has(x)).length
  return common / Math.max(a.length, b.length)
}

/**
 * Umbrales de decisión.
 *
 * Centralizados aquí para poder afinarlos con datos reales sin tocar la lógica.
 * Están deliberadamente altos: ver la nota de arriba sobre no fusionar a ciegas.
 */
export const DEDUP_THRESHOLDS = {
  /** A partir de aquí se fusiona sin preguntar. */
  autoMerge: 0.92,
  /** A partir de aquí se pregunta al usuario. Por debajo, prenda nueva. */
  ask: 0.7,
  /** Confianza del modelo por debajo de la cual la prenda nace "por confirmar". */
  lowModelConfidence: 0.6,
} as const

export type MatchKind = 'auto_merged' | 'needs_confirmation' | 'new_item'

export interface MatchDecision {
  kind: MatchKind
  /** Prenda del armario con la que casa. Solo en fusión o confirmación. */
  existingId?: string
  /** Parecido con esa prenda, 0–1. */
  similarity: number
  /** `true` si la prenda entra al armario sin verificar por el usuario. */
  needsReview: boolean
}

/**
 * Decide qué hacer con una prenda detectada frente al armario que ya existe.
 *
 * `modelConfidence` es lo segura que estaba la IA de su propia lectura. Una
 * prenda mal vista no debe fusionarse con nada, aunque los atributos casen:
 * si la lectura es dudosa, el parecido también lo es.
 */
export function decideMatch(
  garment: ComparableGarment,
  existing: readonly ExistingItem[],
  modelConfidence: number,
): MatchDecision {
  const lowConfidence = modelConfidence < DEDUP_THRESHOLDS.lowModelConfidence

  let best: ExistingItem | null = null
  let bestScore = 0

  for (const candidate of existing) {
    const score = similarity(garment, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  if (!best || bestScore < DEDUP_THRESHOLDS.ask) {
    return { kind: 'new_item', similarity: bestScore, needsReview: lowConfidence }
  }

  // Con lectura dudosa nunca se fusiona en silencio: se pregunta.
  if (bestScore >= DEDUP_THRESHOLDS.autoMerge && !lowConfidence) {
    return {
      kind: 'auto_merged',
      existingId: best.id,
      similarity: bestScore,
      needsReview: false,
    }
  }

  return {
    kind: 'needs_confirmation',
    existingId: best.id,
    similarity: bestScore,
    needsReview: true,
  }
}
