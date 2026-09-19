import { affinityOf, type StyleProfile } from '@/lib/style/profile'
import { applyHardFilters } from './filters'
import { addAccessories, buildPools, generateCandidates } from './candidates'
import { scoreCandidate } from './scoring'
import { selectDiverse } from './diversity'
import { MIN_ITEMS } from './weights'
import { analyzePalette } from './color'
import {
  itemsOf,
  type FilterReason,
  type OutfitCandidate,
  type OutfitContext,
  type ScoredOutfit,
  type WardrobeItem,
} from './types'

/**
 * El motor.
 *
 *   armario → filtros duros → candidatos → puntuación → diversidad → looks
 *
 * Sin una sola llamada de IA (PLAN.md §19). Función pura: mismas entradas,
 * mismas salidas, y por tanto comprobable de verdad con tests.
 *
 * Nunca lanza y nunca devuelve una pantalla vacía sin explicación: si no puede
 * componer nada, lo dice y cuenta por qué.
 */

export interface EngineInput {
  wardrobe: readonly WardrobeItem[]
  profile: StyleProfile
  context: OutfitContext
  dislikedColors?: readonly string[]
  /** Pares de prendas que nunca deben ir juntas. */
  neverCombine?: ReadonlyArray<readonly [string, string]>
  count?: number
}

export interface EngineResult {
  outfits: ScoredOutfit[]
  /** Filtros que hubo que relajar para poder proponer algo. */
  relaxed: FilterReason[]
  /** Si no hay outfits, por qué. */
  emptyReason: 'no_wardrobe' | 'nothing_wearable' | null
  /** Cuántas combinaciones se llegaron a puntuar. Para diagnóstico. */
  evaluated: number
}

export function generateOutfits(input: EngineInput): EngineResult {
  const { wardrobe, profile, context } = input
  const count = input.count ?? 3

  if (wardrobe.length === 0) {
    return { outfits: [], relaxed: [], emptyReason: 'no_wardrobe', evaluated: 0 }
  }

  // --- 1. Filtros duros ---------------------------------------------------
  const trace = applyHardFilters(
    wardrobe,
    { context, dislikedColors: input.dislikedColors, today: context.today },
    profile.formalityBias,
  )

  if (trace.kept.length < MIN_ITEMS) {
    return {
      outfits: [],
      relaxed: trace.relaxed,
      emptyReason: 'nothing_wearable',
      evaluated: 0,
    }
  }

  // --- 2. Candidatos ------------------------------------------------------
  const pools = buildPools(trace.kept, (item) => itemAffinity(item, profile))
  const raw = generateCandidates(pools, context)

  if (raw.length === 0) {
    return {
      outfits: [],
      relaxed: trace.relaxed,
      emptyReason: 'nothing_wearable',
      evaluated: 0,
    }
  }

  // --- 3. Puntuación ------------------------------------------------------
  const banned = buildBanned(input.neverCombine)

  const scored = raw
    .filter((candidate) => !violatesBan(candidate, banned))
    .filter((candidate) => itemsOf(candidate).length >= MIN_ITEMS)
    .map((candidate) =>
      scoreCandidate(candidate, {
        profile,
        context,
        dislikedColors: input.dislikedColors,
      }),
    )

  if (scored.length === 0) {
    return {
      outfits: [],
      relaxed: trace.relaxed,
      emptyReason: 'nothing_wearable',
      evaluated: raw.length,
    }
  }

  // --- 4. Diversidad ------------------------------------------------------
  const selected = selectDiverse(scored, count)

  // --- 5. Accesorios, ya sobre los looks elegidos -------------------------
  const finished = selected.map((outfit) => {
    const withAccessories = addAccessories(outfit.candidate, pools.accessory, (item, candidate) =>
      accessoryFit(item, candidate, profile),
    )
    if (withAccessories.accessories.length === 0) return outfit

    // Se vuelve a puntuar: los accesorios cambian la paleta y la formalidad.
    return scoreCandidate(withAccessories, {
      profile,
      context,
      dislikedColors: input.dislikedColors,
    })
  })

  return {
    outfits: finished,
    relaxed: trace.relaxed,
    emptyReason: null,
    evaluated: scored.length,
  }
}

// ---------------------------------------------------------------------------

/**
 * Afinidad de una prenda suelta. Solo decide qué entra en la combinatoria.
 *
 * Se mezcla con una base fija para que una prenda sobre la que no se sabe nada
 * no quede siempre fuera: si solo contara el perfil, el armario se congelaría en
 * lo que la persona ya usa y nunca descubriría nada.
 */
function itemAffinity(item: WardrobeItem, profile: StyleProfile): number {
  const color = affinityOf(profile, 'color', item.primary_color)
  const fit =
    item.fit === 'unknown' || item.fit === 'regular' ? 0 : affinityOf(profile, 'fit', item.fit)
  const styles = item.styles.map((style) => affinityOf(profile, 'style', style))
  const styleMean = styles.length > 0 ? styles.reduce((a, b) => a + b, 0) / styles.length : 0

  const affinity = (color + fit + styleMean) / 3
  return 0.5 + affinity * 0.5
}

/** ¿Este accesorio suma a este look concreto? */
function accessoryFit(
  item: WardrobeItem,
  candidate: OutfitCandidate,
  profile: StyleProfile,
): number {
  const items = itemsOf(candidate)
  const withAccessory = analyzePalette([...items, item])
  const without = analyzePalette(items)

  // Si empeora la paleta, fuera: un accesorio nunca debería estropear un look.
  if (withAccessory.score < without.score - 0.05) return 0

  const formalityGap = Math.abs(
    item.formality - items.reduce((sum, i) => sum + i.formality, 0) / Math.max(1, items.length),
  )
  if (formalityGap > 1.5) return 0

  return 0.5 + affinityOf(profile, 'color', item.primary_color) * 0.5
}

function buildBanned(pairs?: ReadonlyArray<readonly [string, string]>): Set<string> {
  const banned = new Set<string>()
  for (const [a, b] of pairs ?? []) banned.add([a, b].sort().join('|'))
  return banned
}

function violatesBan(candidate: OutfitCandidate, banned: Set<string>): boolean {
  if (banned.size === 0) return false
  const ids = itemsOf(candidate).map((item) => item.id)

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (banned.has([ids[i]!, ids[j]!].sort().join('|'))) return true
    }
  }
  return false
}
