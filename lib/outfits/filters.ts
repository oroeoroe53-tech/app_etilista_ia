import { layerOf } from '@/lib/wardrobe/taxonomy'
import type { Season } from '@/lib/wardrobe/taxonomy'
import {
  FORMALITY_TOLERANCE,
  OCCASION_FORMALITY,
  RAIN_UNSUITABLE_CATEGORIES,
  RAIN_UNSUITABLE_MATERIALS,
  REST_DAYS,
  TEMPERATURE_BANDS,
} from './weights'
import type { FilterReason, FilterTrace, OutfitContext, WardrobeItem } from './types'

/**
 * Filtros duros.
 *
 * Quitan de en medio lo que no tiene sentido ANTES de combinar nada: menos
 * candidatos que puntuar y, sobre todo, ninguna propuesta absurda (PLAN.md §20).
 *
 * Todo esto es código. Decidir que un abrigo de plumas no pega con 30 grados no
 * necesita un modelo de lenguaje.
 *
 * Regla de oro: **ningún filtro puede dejar un hueco vacío**. Si al aplicarlo no
 * queda nada que ponerse, se relaja y se deja constancia. Una propuesta mediocre
 * es infinitamente mejor que una pantalla que dice "no tengo nada para ti".
 */

export interface FilterOptions {
  context: OutfitContext
  /** Colores que la persona ha vetado expresamente. Mandan sobre todo lo demás. */
  dislikedColors?: readonly string[]
  /** Pares de prendas que nunca deben ir juntas. Se aplica al combinar, no aquí. */
  today?: Date
}

export function temperatureBand(temperatureC: number) {
  return TEMPERATURE_BANDS.find((band) => temperatureC <= band.maxC) ?? TEMPERATURE_BANDS.at(-1)!
}

/** Temporada del hemisferio norte a partir de la fecha. Aproximación suficiente. */
export function seasonOf(date: Date): Season {
  const month = date.getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

/** Formalidad objetivo: lo que se pidió, lo que sugiere la ocasión, o término medio. */
export function targetFormality(context: OutfitContext, profileBias = 0): number {
  if (context.formality) return context.formality
  if (context.occasion) return OCCASION_FORMALITY[context.occasion]
  // El sesgo del perfil va de -1 a 1; 3 es el centro de la escala 1–5.
  return Math.round(Math.min(5, Math.max(1, 3 + profileBias * 1.5)))
}

function daysSince(dateText: string | null, today: Date): number {
  if (!dateText) return Infinity
  const worn = new Date(dateText)
  if (Number.isNaN(worn.getTime())) return Infinity
  const ms = today.getTime() - worn.getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/**
 * Evalúa una prenda contra el contexto.
 * Devuelve el motivo del descarte, o `null` si pasa.
 */
function reject(
  item: WardrobeItem,
  options: FilterOptions,
  formality: number,
  ignore: ReadonlySet<FilterReason>,
): FilterReason | null {
  const { context } = options
  const today = options.today ?? context.today ?? new Date()

  if (!item.is_available) return 'unavailable'

  if (!ignore.has('disliked_color')) {
    const disliked = options.dislikedColors ?? []
    if (disliked.includes(item.primary_color)) return 'disliked_color'
  }

  if (!ignore.has('season')) {
    const season = context.season ?? (context.temperatureC === undefined ? seasonOf(today) : null)
    // Una prenda sin temporadas marcadas vale para todo: no se castiga la falta de dato.
    if (season && item.seasons.length > 0 && !item.seasons.includes(season)) {
      return 'season'
    }
  }

  if (!ignore.has('weather') && context.temperatureC !== undefined) {
    const band = temperatureBand(context.temperatureC)
    const [min, max] = band.warmth
    if (item.warmth < min || item.warmth > max) return 'weather'

    if (context.rain) {
      const category = item.category as string
      const material = item.material as string
      if ((RAIN_UNSUITABLE_CATEGORIES as readonly string[]).includes(category)) return 'weather'
      if ((RAIN_UNSUITABLE_MATERIALS as readonly string[]).includes(material)) return 'weather'
    }
  }

  if (!ignore.has('formality')) {
    if (Math.abs(item.formality - formality) > FORMALITY_TOLERANCE) return 'formality'
  }

  if (!ignore.has('recently_worn')) {
    if (daysSince(item.last_worn_at, today) < REST_DAYS) return 'recently_worn'
  }

  return null
}

/**
 * Orden en que se relajan los filtros cuando no queda nada que ponerse.
 *
 * Lo primero que cede es el descanso de la prenda (repetir camiseta no arruina
 * a nadie); lo último, la temperatura y la disponibilidad, porque proponer un
 * abrigo en agosto o una prenda que está en la lavadora sí destruye la confianza.
 *
 * `unavailable` no aparece: no se relaja nunca.
 */
const RELAXATION_ORDER: readonly FilterReason[] = [
  'recently_worn',
  'formality',
  'season',
  'disliked_color',
  'weather',
]

/** Huecos que hay que poder llenar para que exista un outfit. */
const ESSENTIAL_SLOTS = ['top', 'bottom', 'footwear'] as const

function canDress(items: readonly WardrobeItem[]): boolean {
  const layers = new Set(items.map((item) => layerOf(item.category)))
  const hasBody = (layers.has('top') && layers.has('bottom')) || layers.has('full_body')
  return hasBody
}

/**
 * Aplica los filtros duros, relajando lo justo para que quede algo vestible.
 */
export function applyHardFilters(
  wardrobe: readonly WardrobeItem[],
  options: FilterOptions,
  profileBias = 0,
): FilterTrace {
  const formality = targetFormality(options.context, profileBias)
  const ignore = new Set<FilterReason>()
  const relaxed: FilterReason[] = []

  let kept: WardrobeItem[] = []
  let discarded = new Map<string, FilterReason>()

  const run = () => {
    kept = []
    discarded = new Map()
    for (const item of wardrobe) {
      const reason = reject(item, options, formality, ignore)
      if (reason) discarded.set(item.id, reason)
      else kept.push(item)
    }
  }

  run()

  // Se van soltando filtros mientras no se pueda vestir a nadie.
  for (const reason of RELAXATION_ORDER) {
    if (canDress(kept)) break
    ignore.add(reason)
    relaxed.push(reason)
    run()
  }

  return { kept, discarded, relaxed }
}

export { ESSENTIAL_SLOTS }
