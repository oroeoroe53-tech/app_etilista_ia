import type { Occasion } from '@/lib/wardrobe/taxonomy'

/**
 * Configuración del motor de outfits.
 *
 * Todos los números que deciden qué se propone están aquí (PLAN.md §21). No son
 * definitivos: son un punto de partida razonable para ajustar con uso real.
 */

/** Pesos de cada componente de la puntuación. Deben sumar 1. */
export const SCORE_WEIGHTS = {
  /** ¿Pegan los colores entre sí? Es lo primero que ve cualquiera. */
  color: 0.3,
  /** ¿Las piezas pertenecen al mismo registro estético? */
  style: 0.25,
  /** ¿Encaja con la ocasión y tienen todas una formalidad parecida? */
  occasion: 0.2,
  /** ¿Es sensato para el tiempo que hace? */
  weather: 0.1,
  /** ¿Le gusta a esta persona en concreto? */
  preference: 0.1,
  /** ¿Es algo distinto de lo de siempre? */
  novelty: 0.05,
} as const

export type ScoreComponent = keyof typeof SCORE_WEIGHTS

/**
 * Tope de prendas por hueco antes de combinar.
 *
 * Sin esto, 60 prendas generan decenas de miles de combinaciones (PLAN.md §9,
 * riesgo 3). Se preordena cada hueco por lo bien que encaja la prenda suelta y
 * se combinan solo las mejores: el óptimo global casi siempre está entre ellas,
 * y el coste pasa de cúbico a constante.
 */
export const SLOT_CAP = 8

/**
 * Tope por hueco.
 *
 * El calzado y el abrigo llevan menos que la parte de arriba y la de abajo, y no
 * por capricho: son los huecos donde una alternativa más aporta menos variedad al
 * conjunto, y los que más multiplican la combinatoria.
 *
 * Con estos valores salen unas 1.900 combinaciones en el peor caso, muy por
 * debajo del tope de seguridad. Importa que sea así: ese tope corta el bucle a
 * medias, de modo que si saltara de forma rutinaria las últimas prendas de abajo
 * no llegarían a emparejarse nunca con nada.
 */
export const SLOT_CAPS = {
  top: SLOT_CAP,
  bottom: SLOT_CAP,
  full_body: SLOT_CAP,
  footwear: 6,
  outer: 4,
  accessory: SLOT_CAP,
} as const

/**
 * Tope de combinaciones a puntuar.
 *
 * Red de seguridad, no herramienta de trabajo: si se alcanza, es que algo no va
 * bien en los topes por hueco. Hay un test que comprueba que no salta con un
 * armario grande.
 */
export const MAX_CANDIDATES = 5000

/**
 * Días que una prenda "descansa" tras ponérsela.
 *
 * No es una prohibición: si al aplicarla un hueco se queda vacío, se relaja.
 * Más vale proponer algo repetido que no proponer nada (PLAN.md §20).
 */
export const REST_DAYS = 3

/** Cuánto se penaliza repetir, según los días que hayan pasado. */
export const NOVELTY_DECAY_DAYS = 21

/**
 * Cuánto se castiga que dos looks propuestos se parezcan entre sí.
 *
 * 0 = da igual repetir; 1 = la variedad manda sobre la calidad.
 * Con 0,55 el segundo y el tercer look son claramente distintos del primero sin
 * llegar a ser malos (PLAN.md §22).
 */
export const DIVERSITY_LAMBDA = 0.55

/** Formalidad típica de cada ocasión, cuando no se indica otra cosa. */
export const OCCASION_FORMALITY: Record<Occasion, number> = {
  home: 1,
  sport: 1,
  casual: 2,
  travel: 2,
  work: 4,
  date: 3,
  party: 4,
  formal_event: 5,
}

/** Margen de formalidad admitido antes de descartar una prenda. */
export const FORMALITY_TOLERANCE = 1

/**
 * Temperatura → rango de abrigo aceptable (escala 1–5 de `clothing_items`).
 *
 * Es una tabla, no un modelo: interpretar "8 °C con lluvia" no necesita una IA
 * (PLAN.md §25).
 */
export const TEMPERATURE_BANDS: ReadonlyArray<{
  maxC: number
  warmth: readonly [number, number]
  outerRequired: boolean
}> = [
  { maxC: 9, warmth: [3, 5], outerRequired: true },
  { maxC: 15, warmth: [2, 5], outerRequired: true },
  { maxC: 21, warmth: [2, 4], outerRequired: false },
  { maxC: 27, warmth: [1, 3], outerRequired: false },
  { maxC: Infinity, warmth: [1, 2], outerRequired: false },
]

/** Calzado que no tiene sentido bajo la lluvia. */
export const RAIN_UNSUITABLE_CATEGORIES = ['sandals'] as const
export const RAIN_UNSUITABLE_MATERIALS = ['suede'] as const

/** Cuántos accesorios como mucho. Más de dos deja de ser un look y es un disfraz. */
export const MAX_ACCESSORIES = 2

/** Mínimo de prendas para que algo sea un outfit. */
export const MIN_ITEMS = 2
