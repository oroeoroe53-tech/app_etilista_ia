import type {
  Category, Color, Fit, Layer, Material, Occasion, Pattern, Season, Style,
} from '@/lib/wardrobe/taxonomy'

/**
 * Tipos del motor de outfits.
 *
 * Todo lo que hay en esta carpeta es determinista y sin IA, y un test lo
 * comprueba: `lib/outfits` no puede importar `lib/ai`. La IA solo redacta la
 * frase que acompaña al resultado, y eso ocurre fuera, en la Fase 6.
 */

export interface WardrobeItem {
  id: string
  category: Category
  primary_color: Color
  secondary_colors: Color[]
  pattern: Pattern
  fit: Fit
  material: Material
  styles: Style[]
  seasons: Season[]
  formality: number
  warmth: number
  is_available: boolean
  last_worn_at: string | null
  times_worn: number
}

/** Qué se le pide al motor. Todo opcional: sin contexto también debe responder. */
export interface OutfitContext {
  occasion?: Occasion
  /** 1–5. Si no se indica, se deduce de la ocasión o del perfil. */
  formality?: number
  temperatureC?: number
  rain?: boolean
  wind?: boolean
  season?: Season
  /** Para calcular novedad. Inyectable para que los tests sean deterministas. */
  today?: Date
}

export type Slot = Exclude<Layer, 'accessory'> | 'accessory'

export interface OutfitCandidate {
  top?: WardrobeItem
  bottom?: WardrobeItem
  full_body?: WardrobeItem
  outer?: WardrobeItem
  footwear?: WardrobeItem
  accessories: WardrobeItem[]
}

export interface ScoreBreakdown {
  color: number
  style: number
  occasion: number
  weather: number
  preference: number
  novelty: number
}

export interface ScoredOutfit {
  items: WardrobeItem[]
  candidate: OutfitCandidate
  score: number
  breakdown: ScoreBreakdown
  /**
   * Motivos concretos, ya calculados, de por qué este look funciona.
   * En la Fase 6 son lo único que se le pasa al modelo para que redacte: así no
   * puede inventarse razones que el sistema no ha usado.
   */
  highlights: string[]
}

/** Por qué se descartó una prenda. Sirve para explicar un resultado vacío. */
export type FilterReason =
  | 'unavailable'
  | 'season'
  | 'weather'
  | 'formality'
  | 'disliked_color'
  | 'recently_worn'

export interface FilterTrace {
  kept: WardrobeItem[]
  discarded: Map<string, FilterReason>
  /** `true` si hubo que relajar algún filtro para poder componer algo. */
  relaxed: FilterReason[]
}

export function itemsOf(candidate: OutfitCandidate): WardrobeItem[] {
  return [
    candidate.full_body,
    candidate.top,
    candidate.bottom,
    candidate.outer,
    candidate.footwear,
    ...candidate.accessories,
  ].filter((item): item is WardrobeItem => Boolean(item))
}
