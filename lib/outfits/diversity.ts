import { DIVERSITY_LAMBDA } from './weights'
import type { ScoredOutfit } from './types'

/**
 * Selección con diversidad.
 *
 * Si se cogieran los looks con mejor puntuación a secas, saldrían variaciones
 * del mismo: la misma base con la camiseta cambiada. Técnicamente óptimo,
 * inútil como propuesta (PLAN.md §22).
 *
 * Se elige de forma voraz penalizando el parecido: el primero es el mejor; cada
 * siguiente maximiza su puntuación menos lo que se parece a los ya elegidos.
 *
 * NOTA DE RENDIMIENTO. La versión ingenua de esto recalculaba el parecido de
 * cada candidato contra *todos* los ya elegidos en cada vuelta, y reconstruía
 * los conjuntos de identificadores en cada comparación. Con 40 looks sobre 1.900
 * candidatos eso son tres millones de comparaciones y tardaba 1,3 segundos.
 *
 * Dos cambios lo bajan a decenas de milisegundos, sin cambiar el resultado:
 *   1. Los conjuntos se preparan una vez, no en cada comparación.
 *   2. El parecido máximo de cada candidato se guarda y solo se actualiza contra
 *      el que se acaba de elegir. Es un máximo: no hace falta recalcular el resto.
 */

/** Hasta cuántos candidatos se consideran. Más allá no aportan variedad, solo trabajo. */
const POOL_MULTIPLIER = 20
const POOL_MIN = 200
const POOL_MAX = 800

interface Prepared {
  outfit: ScoredOutfit
  ids: Set<string>
  colors: Set<string>
  key: string
}

function prepare(outfit: ScoredOutfit): Prepared {
  const ids = new Set<string>()
  const colors = new Set<string>()
  for (const item of outfit.items) {
    ids.add(item.id)
    colors.add(item.primary_color)
  }
  return {
    outfit,
    ids,
    colors,
    key: [...ids].sort().join('|'),
  }
}

function overlap(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let shared = 0
  for (const value of small) if (large.has(value)) shared++
  return shared / Math.max(a.size, b.size)
}

function similarityOf(a: Prepared, b: Prepared): number {
  // Las prendas compartidas pesan más: llevar la misma chaqueta se nota más que
  // que dos looks coincidan en tener algo negro.
  return overlap(a.ids, b.ids) * 0.7 + overlap(a.colors, b.colors) * 0.3
}

/** Parecido entre dos looks, de 0 a 1. */
export function similarity(a: ScoredOutfit, b: ScoredOutfit): number {
  return Number(similarityOf(prepare(a), prepare(b)).toFixed(4))
}

export function selectDiverse(
  scored: readonly ScoredOutfit[],
  count: number,
  lambda = DIVERSITY_LAMBDA,
): ScoredOutfit[] {
  if (scored.length === 0 || count <= 0) return []

  // Desempate por las prendas: sin esto, dos looks con la misma puntuación
  // podrían alternarse entre recargas sin que nada haya cambiado.
  const poolSize = Math.min(POOL_MAX, Math.max(POOL_MIN, count * POOL_MULTIPLIER))
  const pool = [...scored]
    .map(prepare)
    .sort((a, b) => b.outfit.score - a.outfit.score || a.key.localeCompare(b.key))
    .slice(0, poolSize)

  if (pool.length <= count) return pool.map((p) => p.outfit)

  const taken = new Uint8Array(pool.length)
  const selected: Prepared[] = [pool[0]!]
  taken[0] = 1

  // Parecido de cada candidato con el conjunto ya elegido. Como es un máximo,
  // basta compararlo con el último añadido para mantenerlo al día.
  const maxSimilarity = new Float64Array(pool.length)
  for (let i = 1; i < pool.length; i++) {
    maxSimilarity[i] = similarityOf(pool[0]!, pool[i]!)
  }

  while (selected.length < count) {
    let bestIndex = -1
    let bestValue = -Infinity

    for (let i = 1; i < pool.length; i++) {
      if (taken[i]) continue
      const value = pool[i]!.outfit.score - lambda * maxSimilarity[i]!
      if (value > bestValue) {
        bestValue = value
        bestIndex = i
      }
    }

    if (bestIndex === -1) break

    taken[bestIndex] = 1
    const chosen = pool[bestIndex]!
    selected.push(chosen)

    for (let i = 1; i < pool.length; i++) {
      if (taken[i]) continue
      const value = similarityOf(chosen, pool[i]!)
      if (value > maxSimilarity[i]!) maxSimilarity[i] = value
    }
  }

  return selected.map((p) => p.outfit)
}
