import { generateOutfits } from './engine'
import { itemsOf } from './types'
import type { StyleProfile } from '@/lib/style/profile'
import type { OutfitContext, ScoredOutfit, WardrobeItem } from './types'

/**
 * La maleta.
 *
 * Aquí el motor trabaja **al revés** que en "¿qué me pongo?". Allí se busca
 * variedad: tres looks lo más distintos posible entre sí. Aquí se busca lo
 * contrario, que las prendas se repitan todo lo posible, porque cada prenda
 * distinta es peso en la maleta.
 *
 * Es el mismo motor y la misma puntuación; solo cambia cómo se elige entre los
 * candidatos. Por eso esto son ochenta líneas y no una función nueva.
 */

export interface PackingInput {
  wardrobe: readonly WardrobeItem[]
  profile: StyleProfile
  /** Un contexto por día: permite que cambie el tiempo durante el viaje. */
  days: readonly OutfitContext[]
  dislikedColors?: readonly string[]
  neverCombine?: ReadonlyArray<readonly [string, string]>
}

export interface PackingDay {
  index: number
  context: OutfitContext
  outfit: ScoredOutfit
}

export interface PackingResult {
  days: PackingDay[]
  /** Todo lo que hay que meter, sin repetir. */
  items: WardrobeItem[]
  /** Prendas que se usan en más de un día. */
  reusedCount: number
  emptyReason: 'no_wardrobe' | 'nothing_wearable' | null
}

/**
 * Cuánto premia reutilizar una prenda que ya va en la maleta.
 *
 * Con 0 saldría lo mismo que "¿qué me pongo?" repetido cada día: los mejores
 * looks posibles y una maleta enorme. Con un valor alto, la maleta sería mínima
 * y todos los días iguales.
 *
 * 0,35 da maletas pequeñas sin que los días dejen de distinguirse.
 */
const REUSE_BONUS = 0.35

/**
 * Cuánto penaliza repetir el look entero del día anterior.
 *
 * Reutilizar prendas está bien; salir dos días seguidos exactamente igual, no.
 */
const SAME_OUTFIT_PENALTY = 0.5

export function planPacking(input: PackingInput): PackingResult {
  const empty: PackingResult = {
    days: [],
    items: [],
    reusedCount: 0,
    emptyReason: null,
  }

  if (input.wardrobe.length === 0) return { ...empty, emptyReason: 'no_wardrobe' }
  if (input.days.length === 0) return empty

  const packed = new Map<string, WardrobeItem>()
  const usageCount = new Map<string, number>()
  const days: PackingDay[] = []

  let previousSignature = ''

  for (const [index, context] of input.days.entries()) {
    // Se piden varios candidatos por día para poder elegir el que mejor
    // aproveche lo que ya va en la maleta.
    const result = generateOutfits({
      wardrobe: input.wardrobe,
      profile: input.profile,
      context,
      dislikedColors: input.dislikedColors,
      neverCombine: input.neverCombine,
      count: 12,
    })

    if (result.outfits.length === 0) {
      // Un día sin opciones no invalida el viaje entero: se salta.
      if (days.length === 0 && index === input.days.length - 1) {
        return { ...empty, emptyReason: result.emptyReason ?? 'nothing_wearable' }
      }
      continue
    }

    const best = pickBest(result.outfits, packed, previousSignature)
    days.push({ index, context, outfit: best })

    previousSignature = signature(best)

    for (const item of best.items) {
      packed.set(item.id, item)
      usageCount.set(item.id, (usageCount.get(item.id) ?? 0) + 1)
    }
  }

  if (days.length === 0) return { ...empty, emptyReason: 'nothing_wearable' }

  return {
    days,
    items: [...packed.values()],
    reusedCount: [...usageCount.values()].filter((n) => n > 1).length,
    emptyReason: null,
  }
}

/**
 * Elige el look del día premiando lo que ya está en la maleta.
 *
 * La proporción es sobre las prendas del look, no sobre el total: un look de
 * dos piezas que reutiliza una vale tanto como uno de cuatro que reutiliza dos.
 */
function pickBest(
  candidates: readonly ScoredOutfit[],
  packed: Map<string, WardrobeItem>,
  previousSignature: string,
): ScoredOutfit {
  let best = candidates[0]!
  let bestValue = -Infinity

  for (const candidate of candidates) {
    const items = itemsOf(candidate.candidate)
    const reused = items.filter((item) => packed.has(item.id)).length
    const ratio = items.length > 0 ? reused / items.length : 0

    let value = candidate.score + REUSE_BONUS * ratio
    if (signature(candidate) === previousSignature) value -= SAME_OUTFIT_PENALTY

    // Desempate estable: sin esto, dos candidatos empatados alternarían entre
    // ejecuciones y la maleta cambiaría sin que cambiara nada.
    if (value > bestValue || (value === bestValue && signature(candidate) < signature(best))) {
      bestValue = value
      best = candidate
    }
  }

  return best
}

function signature(outfit: ScoredOutfit): string {
  return outfit.items
    .map((item) => item.id)
    .sort()
    .join('|')
}
