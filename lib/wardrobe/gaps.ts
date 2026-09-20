import { layerOf, type Category, type Layer, type Season } from './taxonomy'

/**
 * Huecos del armario.
 *
 * "Tienes tres pantalones de vestir y ningún zapato que pegue con ellos."
 *
 * Esto es lo que distingue un consejo de estilista de una lista de la compra: no
 * dice qué comprar, dice **qué combinación te falta para que lo que ya tienes
 * funcione**. Y sale entero de contar lo que hay, sin IA.
 *
 * Regla de tono: se señala lo que bloquea, no lo que sería bonito tener. Un
 * armario al que le "falta" algo según un algoritmo es un armario normal.
 */

export interface GapCandidate {
  category: string
  formality: number
  warmth: number
  seasons: string[]
  is_available: boolean
}

export type GapKind =
  | 'missing_layer'
  | 'formality_orphan'
  | 'season_thin'
  | 'nothing_warm'
  | 'unbalanced'

export interface Gap {
  kind: GapKind
  title: string
  detail: string
  /** `high` bloquea montar looks; `medium` los limita; `low` es una observación. */
  severity: 'high' | 'medium' | 'low'
  /**
   * Cuánto de cubierta está esa necesidad, de 0 a 1.
   *
   * Es un dato contado, no una estimación: "tres prendas de las cuatro que hacen
   * falta para que el invierno no se repita" son 0,75. Cuando lo que falta
   * falta del todo —no hay ni un zapato de vestir— vale cero, y la barra sale
   * vacía. Una barra vacía dice exactamente lo que pasa.
   */
  coverage: number
}

/** Prendas por debajo de las cuales una temporada se queda corta. */
const SEASON_FLOOR = 4

/** Capas sin las que no se puede vestir a nadie. */
const ESSENTIAL: Layer[] = ['top', 'bottom', 'footwear']

const LAYER_NAMES: Record<Layer, string> = {
  top: 'nada para la parte de arriba',
  bottom: 'nada para la parte de abajo',
  outer: 'ninguna prenda de abrigo',
  footwear: 'ningún calzado',
  accessory: 'ningún accesorio',
  full_body: 'ninguna prenda entera',
}

/** Bandas de formalidad, para detectar las que están cojas. */
const BANDS = [
  { name: 'de diario', min: 1, max: 3 },
  { name: 'arreglado', min: 4, max: 5 },
] as const

const SEASON_NAMES: Record<Season, string> = {
  spring: 'primavera',
  summer: 'verano',
  autumn: 'otoño',
  winter: 'invierno',
}

function byLayer(items: readonly GapCandidate[]): Map<Layer, GapCandidate[]> {
  const map = new Map<Layer, GapCandidate[]>()
  for (const item of items) {
    const layer = layerOf(item.category as Category)
    map.set(layer, [...(map.get(layer) ?? []), item])
  }
  return map
}

export function findGaps(all: readonly GapCandidate[]): Gap[] {
  const items = all.filter((item) => item.is_available)
  const gaps: Gap[] = []

  // Con un armario recién empezado, señalar huecos es señalar lo evidente.
  if (items.length < 4) return gaps

  const layers = byLayer(items)
  const hasFullBody = (layers.get('full_body')?.length ?? 0) > 0

  // --- 1. Capas que faltan del todo ---------------------------------------
  for (const layer of ESSENTIAL) {
    const count = layers.get(layer)?.length ?? 0
    if (count > 0) continue
    // Un vestido cubre arriba y abajo a la vez.
    if (hasFullBody && (layer === 'top' || layer === 'bottom')) continue

    gaps.push({
      kind: 'missing_layer',
      title: 'Falta una pieza básica',
      detail: `No tengo ${LAYER_NAMES[layer]} disponible, así que no puedo montarte un look completo.`,
      severity: 'high',
      coverage: 0,
    })
  }

  // --- 2. Bandas de formalidad cojas --------------------------------------
  // El caso típico: pantalones de vestir sin zapatos que peguen.
  for (const band of BANDS) {
    const inBand = (layer: Layer) =>
      (layers.get(layer) ?? []).filter(
        (item) => item.formality >= band.min && item.formality <= band.max,
      ).length

    const tops = inBand('top')
    const bottoms = inBand('bottom')
    const shoes = inBand('footwear')

    // Solo interesa si hay intención de vestir así: al menos dos piezas.
    const present = [tops, bottoms, shoes].filter((n) => n > 0).length
    if (present < 2) continue

    if (shoes === 0) {
      gaps.push({
        kind: 'formality_orphan',
        title: `Te falta calzado ${band.name}`,
        detail: `Tienes ropa ${band.name} pero ningún zapato a esa altura, así que esos looks se quedan a medias.`,
        severity: 'medium',
        coverage: 0,
      })
    } else if (bottoms === 0) {
      gaps.push({
        kind: 'formality_orphan',
        title: `Te falta parte de abajo ${band.name}`,
        detail: `Tienes prendas ${band.name} arriba, pero nada abajo que las acompañe.`,
        severity: 'medium',
        coverage: 0,
      })
    } else if (tops === 0) {
      gaps.push({
        kind: 'formality_orphan',
        title: `Te falta parte de arriba ${band.name}`,
        detail: `Tienes prendas ${band.name} abajo, pero nada arriba que las acompañe.`,
        severity: 'medium',
        coverage: 0,
      })
    }
  }

  // --- 3. Nada que abrigue ------------------------------------------------
  const warm = items.filter((item) => item.warmth >= 4).length
  const winterItems = items.filter((item) => item.seasons.includes('winter')).length

  if (warm === 0 && winterItems > 0) {
    gaps.push({
      kind: 'nothing_warm',
      title: 'Nada de abrigo',
      detail:
        'No tengo ninguna prenda que abrigue de verdad. Cuando bajen las temperaturas me quedaré sin opciones.',
      severity: 'medium',
      coverage: 0,
    })
  }

  // --- 4. Temporadas flojas ------------------------------------------------
  const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter']
  for (const season of seasons) {
    const count = items.filter(
      (item) => item.seasons.length === 0 || item.seasons.includes(season),
    ).length

    if (count > 0 && count < SEASON_FLOOR) {
      gaps.push({
        kind: 'season_thin',
        title: `Poco para ${SEASON_NAMES[season]}`,
        detail: `Solo ${count} ${count === 1 ? 'prenda sirve' : 'prendas sirven'} para ${SEASON_NAMES[season]}. Las propuestas de esa época se van a repetir.`,
        severity: 'low',
        coverage: count / SEASON_FLOOR,
      })
    }
  }

  // --- 5. Desequilibrio arriba/abajo ---------------------------------------
  const tops = (layers.get('top')?.length ?? 0) + (hasFullBody ? 0 : 0)
  const bottoms = layers.get('bottom')?.length ?? 0

  if (bottoms > 0 && tops >= bottoms * 4) {
    gaps.push({
      kind: 'unbalanced',
      title: 'Muchas piezas de arriba, pocas de abajo',
      detail: `${tops} prendas arriba y ${bottoms} abajo. Con pocas piezas de abajo, todos los looks acaban pareciéndose.`,
      severity: 'low',
      // Equilibrado sería una pieza de abajo por cada cuatro de arriba.
      coverage: Math.min(1, bottoms / (tops / 4)),
    })
  }

  // Lo que bloquea primero, la observación al final.
  const order = { high: 0, medium: 1, low: 2 } as const
  return gaps.sort((a, b) => order[a.severity] - order[b.severity])
}
