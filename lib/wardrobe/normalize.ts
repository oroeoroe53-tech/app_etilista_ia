import type { DetectedGarment } from '@/lib/ai/schemas/vision'
import { layerOf, type Season } from './taxonomy'

/**
 * Convierte lo que devuelve la IA en una fila de `clothing_items`.
 *
 * El schema Zod ya garantizó que los valores son del vocabulario permitido. Lo
 * que se hace aquí es rellenar lo que el modelo pudo dejar vacío, usando reglas
 * deterministas en vez de otra llamada de IA (PLAN.md §41).
 */

export interface ClothingItemInsert {
  user_id: string
  category: string
  subcategory: string | null
  primary_color: string
  secondary_colors: string[]
  pattern: string
  fit: string
  material: string
  styles: string[]
  seasons: string[]
  formality: number
  warmth: number
  source: 'onboarding' | 'photo' | 'manual'
  attributes: Record<string, unknown>
  ai_confidence: number
  user_verified: boolean
}

/**
 * Temporadas deducidas del nivel de abrigo cuando el modelo no las indica.
 *
 * Es una regla tosca a propósito: sirve para que el filtro de clima tenga algo
 * con lo que trabajar desde el primer día, y el usuario puede corregirla.
 */
function seasonsFromWarmth(warmth: number): Season[] {
  if (warmth <= 1) return ['summer']
  if (warmth === 2) return ['spring', 'summer', 'autumn']
  if (warmth === 3) return ['spring', 'autumn']
  if (warmth === 4) return ['autumn', 'winter']
  return ['winter']
}

export function toClothingItem(
  garment: DetectedGarment,
  userId: string,
  options: { source?: ClothingItemInsert['source']; needsReview?: boolean } = {},
): ClothingItemInsert {
  const seasons = garment.seasons.length > 0 ? garment.seasons : seasonsFromWarmth(garment.warmth)

  return {
    user_id: userId,
    category: garment.category,
    subcategory: garment.subcategory ?? null,
    primary_color: garment.primary_color,
    // El color principal no debe repetirse entre los secundarios.
    secondary_colors: garment.secondary_colors.filter((c) => c !== garment.primary_color),
    pattern: garment.pattern,
    fit: garment.fit,
    material: garment.material,
    styles: garment.styles,
    seasons,
    formality: garment.formality,
    warmth: garment.warmth,
    source: options.source ?? 'onboarding',
    attributes: {
      layer: layerOf(garment.category),
      garment_group: garment.garment_group,
    },
    ai_confidence: garment.confidence,
    // Nada de lo que dice la IA se da por verificado: eso lo hace el usuario.
    user_verified: false,
  }
}

/** Los textos en español viven en `labels.ts`, que sabe concordar en género y número. */
export { describeGarment } from './labels'
