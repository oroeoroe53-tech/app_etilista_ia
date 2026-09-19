import { DIVERSITY_LAMBDA } from './weights'
import type { ScoredOutfit } from './types'

/**
 * Selección con diversidad.
 *
 * Si se cogieran los tres outfits con mejor puntuación, saldrían tres versiones
 * del mismo look: misma base con la camiseta cambiada. Técnicamente óptimo,
 * inútil como propuesta (PLAN.md §22).
 *
 * Se usa una selección voraz con penalización por parecido: el primero es el
 * mejor; cada siguiente maximiza su puntuación menos lo que se parece a los ya
 * elegidos. Es la idea de "relevancia marginal máxima", que aquí cabe en treinta
 * líneas y no necesita nada más sofisticado.
 */

/** Parecido entre dos looks, de 0 a 1. */
export function similarity(a: ScoredOutfit, b: ScoredOutfit): number {
  const idsA = new Set(a.items.map((item) => item.id))
  const shared = b.items.filter((item) => idsA.has(item.id)).length
  const itemOverlap = shared / Math.max(idsA.size, b.items.length)

  // Compartir paleta también es parecerse, aunque las prendas sean otras.
  const colorsA = new Set(a.items.map((item) => item.primary_color))
  const colorsB = new Set(b.items.map((item) => item.primary_color))
  const sharedColors = [...colorsB].filter((color) => colorsA.has(color)).length
  const colorOverlap = sharedColors / Math.max(colorsA.size, colorsB.size)

  // Las prendas compartidas pesan más: llevar la misma chaqueta se nota más que
  // que dos looks coincidan en tener algo negro.
  return Number((itemOverlap * 0.7 + colorOverlap * 0.3).toFixed(4))
}

export function selectDiverse(
  scored: readonly ScoredOutfit[],
  count: number,
  lambda = DIVERSITY_LAMBDA,
): ScoredOutfit[] {
  if (scored.length === 0) return []

  // Desempate por los ids de las prendas: sin esto, dos outfits con la misma
  // puntuación podrían alternarse entre recargas sin que nada haya cambiado.
  const pool = [...scored].sort(
    (a, b) => b.score - a.score || key(a).localeCompare(key(b)),
  )

  const selected: ScoredOutfit[] = [pool[0]!]
  const remaining = pool.slice(1)

  while (selected.length < count && remaining.length > 0) {
    let bestIndex = 0
    let bestValue = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!
      const maxSimilarity = Math.max(
        ...selected.map((chosen) => similarity(chosen, candidate)),
      )
      const value = candidate.score - lambda * maxSimilarity

      if (value > bestValue) {
        bestValue = value
        bestIndex = i
      }
    }

    selected.push(remaining[bestIndex]!)
    remaining.splice(bestIndex, 1)
  }

  return selected
}

function key(outfit: ScoredOutfit): string {
  return outfit.items
    .map((item) => item.id)
    .sort()
    .join('|')
}
