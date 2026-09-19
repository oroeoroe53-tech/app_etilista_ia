import { layerOf } from '@/lib/wardrobe/taxonomy'
import { MAX_ACCESSORIES, MAX_CANDIDATES, SLOT_CAPS } from './weights'
import { temperatureBand } from './filters'
import type { OutfitCandidate, OutfitContext, WardrobeItem } from './types'

/**
 * Generación de candidatos.
 *
 * El problema a evitar es la explosión combinatoria (PLAN.md §9, riesgo 3):
 * 60 prendas dan decenas de miles de combinaciones, y puntuarlas todas es tirar
 * tiempo para descartar el 99 %.
 *
 * La solución es preordenar cada hueco por lo bien que encaja la prenda **por sí
 * sola** y combinar solo las mejores. No garantiza el óptimo global, pero el
 * óptimo casi siempre está entre las mejores de cada hueco, y el coste pasa de
 * crecer al cubo a ser constante.
 */

export interface SlotPools {
  top: WardrobeItem[]
  bottom: WardrobeItem[]
  full_body: WardrobeItem[]
  outer: WardrobeItem[]
  footwear: WardrobeItem[]
  accessory: WardrobeItem[]
}

/**
 * Afinidad de una prenda suelta, de 0 a 1. Solo para preordenar los huecos.
 * La puntuación de verdad mira el conjunto; esto solo decide quién entra al sorteo.
 */
export type ItemAffinity = (item: WardrobeItem) => number

export function buildPools(
  items: readonly WardrobeItem[],
  affinity: ItemAffinity,
  caps: Partial<Record<keyof SlotPools, number>> = {},
): SlotPools {
  const pools: SlotPools = {
    top: [], bottom: [], full_body: [], outer: [], footwear: [], accessory: [],
  }

  for (const item of items) {
    pools[layerOf(item.category)].push(item)
  }

  for (const key of Object.keys(pools) as Array<keyof SlotPools>) {
    pools[key] = pools[key]
      .map((item) => ({ item, score: affinity(item) }))
      // Desempate por id: sin esto el orden depende del que devuelva la base de
      // datos y las propuestas cambiarían sin motivo entre recargas.
      .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
      .slice(0, caps[key] ?? SLOT_CAPS[key])
      .map((entry) => entry.item)
  }

  return pools
}

/** ¿Hace falta abrigo? Lo dice la tabla de temperatura, no un modelo. */
export function outerNeeded(context: OutfitContext): 'required' | 'optional' | 'unwanted' {
  if (context.rain) return 'required'
  if (context.temperatureC === undefined) return 'optional'

  const band = temperatureBand(context.temperatureC)
  if (band.outerRequired) return 'required'
  if (context.temperatureC >= 26) return 'unwanted'
  return 'optional'
}

/**
 * Combina los huecos en outfits completos.
 *
 * Dos formas válidas de vestirse: pieza de arriba + pieza de abajo, o una prenda
 * entera (vestido, mono, traje). Se generan las dos y compiten entre sí.
 */
export function generateCandidates(
  pools: SlotPools,
  context: OutfitContext,
  limit = MAX_CANDIDATES,
): OutfitCandidate[] {
  const candidates: OutfitCandidate[] = []
  const outer = outerNeeded(context)

  // `undefined` representa "sin abrigo", que es una opción legítima.
  const outerOptions: Array<WardrobeItem | undefined> =
    outer === 'required'
      ? pools.outer.length > 0
        ? pools.outer
        : [undefined] // no tiene abrigo: se propone igual, no se le deja sin nada
      : outer === 'unwanted'
        ? [undefined]
        : [undefined, ...pools.outer]

  const footwearOptions: Array<WardrobeItem | undefined> =
    pools.footwear.length > 0 ? pools.footwear : [undefined]

  const bodyCombos: Array<Pick<OutfitCandidate, 'top' | 'bottom' | 'full_body'>> = []

  for (const top of pools.top) {
    for (const bottom of pools.bottom) {
      bodyCombos.push({ top, bottom })
    }
  }
  for (const full_body of pools.full_body) {
    bodyCombos.push({ full_body })
  }

  outer_loop: for (const body of bodyCombos) {
    for (const footwear of footwearOptions) {
      for (const outerItem of outerOptions) {
        candidates.push({ ...body, footwear, outer: outerItem, accessories: [] })
        if (candidates.length >= limit) break outer_loop
      }
    }
  }

  return candidates
}

/**
 * Añade accesorios al outfit ya elegido, no antes.
 *
 * Meterlos en la combinatoria multiplicaría los candidatos por diez para decidir
 * algo que casi no cambia la puntuación. Se eligen al final, sobre el look ganador.
 */
export function addAccessories(
  candidate: OutfitCandidate,
  accessories: readonly WardrobeItem[],
  pick: (item: WardrobeItem, candidate: OutfitCandidate) => number,
  max = MAX_ACCESSORIES,
): OutfitCandidate {
  if (accessories.length === 0) return candidate

  const chosen = accessories
    .map((item) => ({ item, score: pick(item, candidate) }))
    .filter((entry) => entry.score > 0.5)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, max)
    .map((entry) => entry.item)

  return { ...candidate, accessories: chosen }
}
