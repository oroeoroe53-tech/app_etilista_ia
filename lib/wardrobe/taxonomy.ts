/**
 * Vocabulario cerrado del armario.
 *
 * Es el contrato compartido entre tres sitios que tienen que coincidir o todo se rompe:
 *   1. el schema SQL (constraints CHECK)
 *   2. el schema Zod que valida lo que devuelve la IA
 *   3. la interfaz (filtros, etiquetas, formularios)
 *
 * Por eso vive aquí y en ningún otro lado. Si la IA devuelve algo fuera de estas listas,
 * se normaliza (`normalize.ts`) o se descarta: nunca se guarda tal cual.
 */

export const LAYERS = ['top', 'bottom', 'outer', 'footwear', 'accessory', 'full_body'] as const
export type Layer = (typeof LAYERS)[number]

/** Categoría → capa que ocupa en un outfit. Lo usa el motor para no proponer dos pantalones. */
export const CATEGORIES = {
  // top
  tshirt: 'top',
  shirt: 'top',
  polo: 'top',
  blouse: 'top',
  sweater: 'top',
  hoodie: 'top',
  sweatshirt: 'top',
  tank_top: 'top',
  // bottom
  jeans: 'bottom',
  trousers: 'bottom',
  chinos: 'bottom',
  shorts: 'bottom',
  skirt: 'bottom',
  joggers: 'bottom',
  // outer
  jacket: 'outer',
  coat: 'outer',
  blazer: 'outer',
  cardigan: 'outer',
  vest: 'outer',
  // full_body
  dress: 'full_body',
  jumpsuit: 'full_body',
  suit: 'full_body',
  // footwear
  sneakers: 'footwear',
  shoes: 'footwear',
  boots: 'footwear',
  sandals: 'footwear',
  // accessory
  bag: 'accessory',
  belt: 'accessory',
  hat: 'accessory',
  scarf: 'accessory',
  glasses: 'accessory',
  watch: 'accessory',
  jewelry: 'accessory',
} as const satisfies Record<string, Layer>

export type Category = keyof typeof CATEGORIES
export const CATEGORY_LIST = Object.keys(CATEGORIES) as Category[]

export function layerOf(category: Category): Layer {
  return CATEGORIES[category]
}

export const COLORS = [
  'black', 'white', 'grey', 'navy', 'blue', 'light_blue', 'beige', 'brown',
  'cream', 'green', 'olive', 'red', 'burgundy', 'pink', 'purple', 'yellow',
  'orange', 'gold', 'silver', 'multicolor',
] as const
export type Color = (typeof COLORS)[number]

export const PATTERNS = [
  'solid', 'striped', 'checked', 'plaid', 'floral', 'graphic', 'denim',
  'camo', 'animal', 'geometric', 'other',
] as const
export type Pattern = (typeof PATTERNS)[number]

export const FITS = ['skinny', 'slim', 'regular', 'relaxed', 'oversized', 'unknown'] as const
export type Fit = (typeof FITS)[number]

export const MATERIALS = [
  'cotton', 'denim', 'wool', 'linen', 'leather', 'synthetic', 'knit',
  'silk', 'suede', 'unknown',
] as const
export type Material = (typeof MATERIALS)[number]

export const STYLES = [
  'minimal', 'casual', 'streetwear', 'formal', 'business', 'sporty',
  'elegant', 'vintage', 'boho', 'preppy', 'edgy',
] as const
export type Style = (typeof STYLES)[number]

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]

/** 1 = pijama · 3 = calle · 5 = etiqueta. */
export const FORMALITY_MIN = 1
export const FORMALITY_MAX = 5

/** 1 = tirantes en agosto · 5 = plumas de montaña. Lo usa el filtro de clima. */
export const WARMTH_MIN = 1
export const WARMTH_MAX = 5

export const OCCASIONS = [
  'work', 'casual', 'date', 'sport', 'party', 'formal_event', 'travel', 'home',
] as const
export type Occasion = (typeof OCCASIONS)[number]
