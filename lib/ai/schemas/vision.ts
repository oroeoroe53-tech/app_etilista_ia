import { z } from 'zod'
import {
  CATEGORY_LIST, COLORS, PATTERNS, FITS, MATERIALS, STYLES, SEASONS, OCCASIONS,
  type Category,
} from '@/lib/wardrobe/taxonomy'

/** `z.enum` necesita una tupla no vacía; las listas de la taxonomía son arrays. */
function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as unknown as [T, ...T[]])
}

export const bboxSchema = z.object({
  photo_index: z.number().int().min(0),
  // Coordenadas normalizadas 0–1 respecto a la imagen enviada al modelo.
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
})
export type Bbox = z.infer<typeof bboxSchema>

/**
 * Una prenda detectada.
 *
 * `garment_group` es la clave del asunto: al ver las 6 fotos a la vez, el modelo
 * agrupa "la camiseta negra de la foto 1, 2 y 4" bajo un mismo identificador.
 * Eso es lo que evita crear tres camisetas negras duplicadas.
 */
export const detectedGarmentSchema = z.object({
  garment_group: z.string().min(1),
  photo_indexes: z.array(z.number().int().min(0)).min(1),

  category: enumOf(CATEGORY_LIST),
  subcategory: z.string().max(60).nullish(),

  primary_color: enumOf(COLORS),
  secondary_colors: z.array(enumOf(COLORS)).max(4).default([]),
  pattern: enumOf(PATTERNS).default('solid'),
  fit: enumOf(FITS).default('unknown'),
  material: enumOf(MATERIALS).default('unknown'),

  styles: z.array(enumOf(STYLES)).max(4).default([]),
  seasons: z.array(enumOf(SEASONS)).max(4).default([]),
  formality: z.number().int().min(1).max(5).default(3),
  warmth: z.number().int().min(1).max(5).default(3),

  bboxes: z.array(bboxSchema).default([]),
  confidence: z.number().min(0).max(1),
})
export type DetectedGarment = z.infer<typeof detectedGarmentSchema>

export const photoReadingSchema = z.object({
  photo_index: z.number().int().min(0),
  occasion_guess: enumOf(OCCASIONS).nullish(),
  unusable: z.boolean().default(false),
  note: z.string().max(200).nullish(),
})

export const outfitBatchAnalysisSchema = z.object({
  garments: z.array(detectedGarmentSchema).max(80),
  photos: z.array(photoReadingSchema).default([]),
})
export type OutfitBatchAnalysis = z.infer<typeof outfitBatchAnalysisSchema>

/** Foto de una prenda suelta: no hay agrupación que hacer. */
export const singleItemAnalysisSchema = detectedGarmentSchema
  .omit({ garment_group: true, photo_indexes: true })
export type SingleItemAnalysis = z.infer<typeof singleItemAnalysisSchema>

/**
 * Forma del JSON que se le describe al modelo en el prompt.
 * Se mantiene a mano y no se deriva del schema Zod a propósito: lo que el modelo
 * necesita es una descripción legible y corta, no un JSON Schema de 300 líneas
 * que además encarece el prompt.
 */
export const VISION_OUTPUT_SHAPE = `{
  "garments": [
    {
      "garment_group": "g1",
      "photo_indexes": [0, 2],
      "category": "<una de: ${CATEGORY_LIST.join(' | ')}>",
      "subcategory": "texto corto o null",
      "primary_color": "<una de: ${COLORS.join(' | ')}>",
      "secondary_colors": [],
      "pattern": "<una de: ${PATTERNS.join(' | ')}>",
      "fit": "<una de: ${FITS.join(' | ')}>",
      "material": "<una de: ${MATERIALS.join(' | ')}>",
      "styles": ["<de: ${STYLES.join(' | ')}>"],
      "seasons": ["<de: ${SEASONS.join(' | ')}>"],
      "formality": 3,
      "warmth": 3,
      "bboxes": [{ "photo_index": 0, "x": 0.31, "y": 0.12, "w": 0.38, "h": 0.29 }],
      "confidence": 0.9
    }
  ],
  "photos": [
    { "photo_index": 0, "occasion_guess": "casual", "unusable": false, "note": null }
  ]
}`

export type { Category }
