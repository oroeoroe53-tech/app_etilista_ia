import type {
  Category, Color, Fit, Material, Pattern, Season, Style, Occasion,
} from './taxonomy'

/**
 * Textos en español del vocabulario del armario.
 *
 * Aquí hay más trabajo del que parece, y es deliberado: el español concuerda en
 * género y número, así que no basta con traducir palabra a palabra. "Jersey
 * negra" o "Zapatillas blanco" delatan al instante que detrás hay una plantilla
 * y no alguien que escribe.
 *
 * Por eso cada categoría lleva su género y su número, y los adjetivos guardan
 * sus cuatro formas. Los invariables (beis, rosa, oversize) las repiten.
 */

type Gender = 'm' | 'f'
type Count = 's' | 'p'

interface Noun {
  label: string
  gender: Gender
  count: Count
}

/** Las cuatro formas de un adjetivo. */
interface Adjective {
  ms: string
  fs: string
  mp: string
  fp: string
}

/** Atajo para adjetivos invariables: beis, rosa, naranja… */
const inv = (word: string): Adjective => ({ ms: word, fs: word, mp: word, fp: word })

/** Atajo para los que solo cambian en número: gris → grises. */
const byCount = (singular: string, plural: string): Adjective => ({
  ms: singular,
  fs: singular,
  mp: plural,
  fp: plural,
})

/** Atajo para los regulares en -o: negro → negra, negros, negras. */
const regular = (stem: string): Adjective => ({
  ms: `${stem}o`,
  fs: `${stem}a`,
  mp: `${stem}os`,
  fp: `${stem}as`,
})

function agree(adjective: Adjective, noun: Noun): string {
  if (noun.count === 'p') return noun.gender === 'f' ? adjective.fp : adjective.mp
  return noun.gender === 'f' ? adjective.fs : adjective.ms
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<Category, Noun> = {
  tshirt: { label: 'Camiseta', gender: 'f', count: 's' },
  shirt: { label: 'Camisa', gender: 'f', count: 's' },
  polo: { label: 'Polo', gender: 'm', count: 's' },
  blouse: { label: 'Blusa', gender: 'f', count: 's' },
  sweater: { label: 'Jersey', gender: 'm', count: 's' },
  hoodie: { label: 'Sudadera con capucha', gender: 'f', count: 's' },
  sweatshirt: { label: 'Sudadera', gender: 'f', count: 's' },
  tank_top: { label: 'Camiseta de tirantes', gender: 'f', count: 's' },

  jeans: { label: 'Vaqueros', gender: 'm', count: 'p' },
  trousers: { label: 'Pantalón', gender: 'm', count: 's' },
  chinos: { label: 'Chinos', gender: 'm', count: 'p' },
  shorts: { label: 'Pantalón corto', gender: 'm', count: 's' },
  skirt: { label: 'Falda', gender: 'f', count: 's' },
  joggers: { label: 'Pantalón de chándal', gender: 'm', count: 's' },

  jacket: { label: 'Chaqueta', gender: 'f', count: 's' },
  coat: { label: 'Abrigo', gender: 'm', count: 's' },
  blazer: { label: 'Americana', gender: 'f', count: 's' },
  cardigan: { label: 'Cárdigan', gender: 'm', count: 's' },
  vest: { label: 'Chaleco', gender: 'm', count: 's' },

  dress: { label: 'Vestido', gender: 'm', count: 's' },
  jumpsuit: { label: 'Mono', gender: 'm', count: 's' },
  suit: { label: 'Traje', gender: 'm', count: 's' },

  sneakers: { label: 'Zapatillas', gender: 'f', count: 'p' },
  shoes: { label: 'Zapatos', gender: 'm', count: 'p' },
  boots: { label: 'Botas', gender: 'f', count: 'p' },
  sandals: { label: 'Sandalias', gender: 'f', count: 'p' },

  bag: { label: 'Bolso', gender: 'm', count: 's' },
  belt: { label: 'Cinturón', gender: 'm', count: 's' },
  hat: { label: 'Sombrero', gender: 'm', count: 's' },
  scarf: { label: 'Bufanda', gender: 'f', count: 's' },
  glasses: { label: 'Gafas', gender: 'f', count: 'p' },
  watch: { label: 'Reloj', gender: 'm', count: 's' },
  jewelry: { label: 'Joya', gender: 'f', count: 's' },
}

// ---------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------

export const COLOR_LABELS: Record<Color, Adjective> = {
  black: regular('negr'),
  white: regular('blanc'),
  grey: byCount('gris', 'grises'),
  navy: inv('azul marino'),
  blue: byCount('azul', 'azules'),
  light_blue: byCount('azul claro', 'azules claros'),
  beige: inv('beis'),
  brown: byCount('marrón', 'marrones'),
  cream: inv('crema'),
  green: byCount('verde', 'verdes'),
  olive: inv('verde oliva'),
  red: regular('roj'),
  burgundy: inv('burdeos'),
  pink: inv('rosa'),
  purple: regular('morad'),
  yellow: regular('amarill'),
  orange: inv('naranja'),
  gold: regular('dorad'),
  silver: regular('platead'),
  multicolor: byCount('multicolor', 'multicolores'),
}

// ---------------------------------------------------------------------------
// Resto de atributos
// ---------------------------------------------------------------------------

export const PATTERN_LABELS: Record<Pattern, Adjective> = {
  solid: regular('lis'),
  striped: inv('de rayas'),
  checked: inv('de cuadros'),
  plaid: inv('de tartán'),
  floral: inv('de flores'),
  graphic: regular('estampad'),
  denim: regular('vaquer'),
  camo: inv('de camuflaje'),
  animal: inv('de animal print'),
  geometric: regular('geométric'),
  other: inv(''),
}

export const FIT_LABELS: Record<Fit, Adjective> = {
  skinny: regular('ajustad'),
  slim: regular('entallad'),
  regular: inv(''),
  relaxed: regular('holgad'),
  oversized: inv('oversize'),
  unknown: inv(''),
}

export const MATERIAL_LABELS: Record<Material, string> = {
  cotton: 'Algodón',
  denim: 'Vaquero',
  wool: 'Lana',
  linen: 'Lino',
  leather: 'Piel',
  synthetic: 'Sintético',
  knit: 'Punto',
  silk: 'Seda',
  suede: 'Ante',
  unknown: 'Sin determinar',
}

export const STYLE_LABELS: Record<Style, string> = {
  minimal: 'Minimalista',
  casual: 'Casual',
  streetwear: 'Urbano',
  formal: 'Formal',
  business: 'Oficina',
  sporty: 'Deportivo',
  elegant: 'Elegante',
  vintage: 'Vintage',
  boho: 'Bohemio',
  preppy: 'Preppy',
  edgy: 'Atrevido',
}

export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Primavera',
  summer: 'Verano',
  autumn: 'Otoño',
  winter: 'Invierno',
}

export const OCCASION_LABELS: Record<Occasion, string> = {
  work: 'Trabajo',
  casual: 'Diario',
  date: 'Cita',
  sport: 'Deporte',
  party: 'Fiesta',
  formal_event: 'Evento formal',
  travel: 'Viaje',
  home: 'Casa',
}

export const LAYER_LABELS: Record<string, string> = {
  top: 'Arriba',
  bottom: 'Abajo',
  outer: 'Abrigo',
  full_body: 'Enteros',
  footwear: 'Calzado',
  accessory: 'Accesorios',
}

/** 1 → estar por casa · 5 → etiqueta. */
export const FORMALITY_LABELS: Record<number, string> = {
  1: 'Estar por casa',
  2: 'Muy informal',
  3: 'Diario',
  4: 'Arreglado',
  5: 'Etiqueta',
}

/** 1 → para calor · 5 → para mucho frío. */
export const WARMTH_LABELS: Record<number, string> = {
  1: 'Para calor',
  2: 'Ligera',
  3: 'Media',
  4: 'Abriga',
  5: 'Para mucho frío',
}

/** Textos neutros a propósito: evitan concordar con la prenda. */
export const CONDITION_LABELS: Record<string, string> = {
  new: 'Sin estrenar',
  good: 'Buen estado',
  worn: 'Uso marcado',
  retired: 'Fuera de uso',
}

// ---------------------------------------------------------------------------
// Composición
// ---------------------------------------------------------------------------

/** Etiqueta suelta de un color, para filtros y formularios. */
export function colorLabel(color: string): string {
  const forms = COLOR_LABELS[color as Color]
  if (!forms) return color
  return forms.ms.charAt(0).toUpperCase() + forms.ms.slice(1)
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as Category]?.label ?? category
}

/**
 * Nombre legible de una prenda: "Camiseta negra oversize", "Vaqueros azul marino".
 *
 * Se calcula, no se guarda: así cambia solo en cuanto el usuario corrige un
 * atributo, sin tener que actualizar nada más.
 */
export function describeGarment(item: {
  category: string
  primary_color: string
  fit?: string | null
  pattern?: string | null
}): string {
  const noun = CATEGORY_LABELS[item.category as Category]
  if (!noun) return item.category

  const parts = [noun.label]

  const color = COLOR_LABELS[item.primary_color as Color]
  if (color) parts.push(agree(color, noun))

  // El estampado solo se menciona si aporta: "lisa" no distingue nada.
  const pattern = item.pattern ? PATTERN_LABELS[item.pattern as Pattern] : null
  if (pattern && item.pattern !== 'solid') {
    const word = agree(pattern, noun)
    if (word) parts.push(word)
  }

  const fit = item.fit ? FIT_LABELS[item.fit as Fit] : null
  if (fit) {
    const word = agree(fit, noun)
    if (word) parts.push(word)
  }

  return parts.join(' ')
}
