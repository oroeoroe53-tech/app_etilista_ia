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

/**
 * Nombre legible de una prenda, para listas y para el texto de "¿es la misma?".
 * Se calcula, no se guarda: así cambia solo cuando el usuario corrige atributos.
 */
export function describeGarment(item: {
  category: string
  primary_color: string
  fit?: string | null
  pattern?: string | null
}): string {
  const CATEGORIES: Record<string, string> = {
    tshirt: 'Camiseta', shirt: 'Camisa', polo: 'Polo', blouse: 'Blusa',
    sweater: 'Jersey', hoodie: 'Sudadera con capucha', sweatshirt: 'Sudadera',
    tank_top: 'Camiseta de tirantes', jeans: 'Vaqueros', trousers: 'Pantalón',
    chinos: 'Chinos', shorts: 'Pantalón corto', skirt: 'Falda', joggers: 'Pantalón de chándal',
    jacket: 'Chaqueta', coat: 'Abrigo', blazer: 'Americana', cardigan: 'Cárdigan',
    vest: 'Chaleco', dress: 'Vestido', jumpsuit: 'Mono', suit: 'Traje',
    sneakers: 'Zapatillas', shoes: 'Zapatos', boots: 'Botas', sandals: 'Sandalias',
    bag: 'Bolso', belt: 'Cinturón', hat: 'Sombrero', scarf: 'Bufanda',
    glasses: 'Gafas', watch: 'Reloj', jewelry: 'Joya',
  }

  const COLORS: Record<string, string> = {
    black: 'negra', white: 'blanca', grey: 'gris', navy: 'azul marino',
    blue: 'azul', light_blue: 'azul claro', beige: 'beis', brown: 'marrón',
    cream: 'crema', green: 'verde', olive: 'verde oliva', red: 'roja',
    burgundy: 'burdeos', pink: 'rosa', purple: 'morada', yellow: 'amarilla',
    orange: 'naranja', gold: 'dorada', silver: 'plateada', multicolor: 'multicolor',
  }

  const FITS: Record<string, string> = {
    oversized: 'oversize', skinny: 'ajustada', slim: 'entallada',
    relaxed: 'holgada', regular: '', unknown: '',
  }

  const name = CATEGORIES[item.category] ?? item.category
  const color = COLORS[item.primary_color] ?? item.primary_color
  const fit = item.fit ? (FITS[item.fit] ?? '') : ''

  return [name, color, fit].filter(Boolean).join(' ')
}
