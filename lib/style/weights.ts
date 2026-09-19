/**
 * Pesos del aprendizaje de estilo.
 *
 * Todos los números que deciden cuánto cuenta cada señal están aquí y solo aquí
 * (PLAN.md §18). Son valores de partida: la idea es ajustarlos con datos reales,
 * y eso tiene que ser editar un archivo, no rastrear constantes por el código.
 *
 * Ninguna IA participa en esto. Es aritmética.
 */

export type Dimension = 'style' | 'color' | 'fit'

export const DIMENSIONS: readonly Dimension[] = ['style', 'color', 'fit']

/**
 * Puntos de evidencia que aporta cada señal.
 *
 * La escala importa poco en términos absolutos: lo que importa es la proporción
 * entre ellas. Tener una prenda dice bastante; ponérsela dice más que tenerla
 * guardada; y un rechazo pesa más que un "me gusta" porque la gente descarta
 * con más criterio del que aprueba.
 */
export const SIGNAL_POINTS = {
  /** La prenda está en el armario. */
  ownItem: 1,
  /** Aparece en una foto que la persona subió: la lleva de verdad. */
  photoAppearance: 0.75,
  /** Se la ha puesto (una vez por registro de uso). */
  wearItem: 0.5,

  outfitLike: 1,
  outfitLove: 2.5,
  outfitDislike: -1.75,
  /** "No sé": no dice nada. Se registra, pero no mueve el perfil. */
  outfitSkip: 0,
} as const

/**
 * Constante de saturación.
 *
 * Convierte puntos acumulados en afinidad de -1 a 1 con rendimientos
 * decrecientes: las primeras señales mueven mucho el perfil y las siguientes
 * cada vez menos.
 *
 * Con K = 5: 5 puntos → 0,50 · 15 → 0,75 · 45 → 0,90.
 *
 * Subirlo hace el sistema más prudente (necesita más evidencia); bajarlo lo hace
 * más reactivo y más fácil de despistar por una racha.
 */
export const SATURATION_K = 5

/**
 * Cuando alguien dice POR QUÉ no le gusta un outfit, el castigo va solo a esa
 * dimensión (PLAN.md §17).
 *
 * Rechazar un look "por el color" no debe penalizar su corte ni su estilo: es
 * justo la información que evita que el perfil se emborrone.
 *
 * Sin motivo, el rechazo reparte en las tres.
 */
export const DISLIKE_REASON_DIMENSIONS: Record<string, readonly Dimension[]> = {
  color: ['color'],
  fit: ['fit'],
  item: [], // "una prenda concreta": no dice nada del estilo en general
  too_formal: [],
  too_casual: [],
  not_my_style: ['style'],
  other: ['style', 'color', 'fit'],
}

/** Cuánto mueve la formalidad un rechazo por "demasiado formal" o "demasiado informal". */
export const FORMALITY_NUDGE = 0.08

/**
 * Señales necesarias para fiarse del perfil.
 *
 * Por debajo, la aplicación lo dice en voz alta ("todavía te estoy conociendo")
 * y el motor de outfits le dará menos peso frente a las reglas objetivas.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Sin esto, no hay perfil que enseñar. */
  minimum: 8,
  /** A partir de aquí, el perfil se considera formado. */
  established: 40,
} as const

/** Umbral a partir del cual se considera que algo "le gusta" de verdad. */
export const AFFINITY_LIKED = 0.45

/** Umbral por debajo del cual se considera rechazo activo. */
export const AFFINITY_DISLIKED = -0.3
