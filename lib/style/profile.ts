import {
  SATURATION_K,
  CONFIDENCE_THRESHOLDS,
  AFFINITY_LIKED,
  AFFINITY_DISLIKED,
  type Dimension,
} from './weights'

/**
 * El perfil de estilo.
 *
 * Decisión de fondo: en la base de datos NO se guardan afinidades de 0 a 1, se
 * guardan **puntos de evidencia** en bruto, que pueden ser negativos.
 *
 * Es importante, porque 0 significa dos cosas muy distintas: "no sé nada de este
 * color" y "lo rechaza siempre". Si se guardara ya normalizado, esa diferencia se
 * perdería para siempre y el motor no podría distinguir entre no proponer algo por
 * desconocimiento y evitarlo por decisión de la persona.
 *
 * La afinidad se calcula al leer, con `affinity()`.
 */

export interface StyleProfile {
  /** Puntos en bruto por valor. Pueden ser negativos. */
  style: Record<string, number>
  color: Record<string, number>
  fit: Record<string, number>
  /** -1 informal · 0 indiferente · +1 formal. */
  formalityBias: number
  /** Cuántas señales lo sostienen. */
  signalCount: number
}

export function emptyProfile(): StyleProfile {
  return { style: {}, color: {}, fit: {}, formalityBias: 0, signalCount: 0 }
}

/**
 * Puntos → afinidad de -1 a 1, con rendimientos decrecientes.
 *
 * Es simétrica: 10 puntos a favor y 10 en contra dan la misma magnitud con
 * signo opuesto. Y está acotada, así que ninguna racha puede disparar un valor
 * hasta dominar al resto.
 */
/** Nunca se alcanza el 1 exacto: siempre queda margen para una preferencia más fuerte. */
const MAX_AFFINITY = 0.9999

export function affinity(points: number): number {
  const magnitude = Math.abs(points) / (Math.abs(points) + SATURATION_K)
  // El redondeo por sí solo convertiría 0,999995 en un 1 clavado, y con él se
  // perdería la garantía de que la afinidad está acotada por debajo de 1.
  const bounded = Math.min(Number(magnitude.toFixed(4)), MAX_AFFINITY)
  return points < 0 ? -bounded : bounded
}

export function affinityOf(profile: StyleProfile, dimension: Dimension, value: string): number {
  return affinity(profile[dimension][value] ?? 0)
}

export interface RankedValue {
  value: string
  points: number
  affinity: number
}

/** Valores de una dimensión ordenados de mayor a menor afinidad. */
export function ranked(profile: StyleProfile, dimension: Dimension): RankedValue[] {
  return Object.entries(profile[dimension])
    .map(([value, points]) => ({ value, points, affinity: affinity(points) }))
    .sort((a, b) => b.affinity - a.affinity)
}

/** Lo que más le gusta de una dimensión. */
export function topValues(profile: StyleProfile, dimension: Dimension, limit = 3): RankedValue[] {
  return ranked(profile, dimension)
    .filter((r) => r.affinity >= AFFINITY_LIKED)
    .slice(0, limit)
}

/** Lo que rechaza de forma consistente. */
export function rejectedValues(profile: StyleProfile, dimension: Dimension): RankedValue[] {
  return ranked(profile, dimension)
    .filter((r) => r.affinity <= AFFINITY_DISLIKED)
    .reverse()
}

export type Confidence = 'unknown' | 'learning' | 'established'

export function confidence(profile: StyleProfile): Confidence {
  if (profile.signalCount < CONFIDENCE_THRESHOLDS.minimum) return 'unknown'
  if (profile.signalCount < CONFIDENCE_THRESHOLDS.established) return 'learning'
  return 'established'
}

/**
 * Cuánto debe fiarse el motor de outfits de este perfil, de 0 a 1.
 *
 * Con un perfil recién nacido, las reglas objetivas (clima, ocasión) deben pesar
 * más que unas preferencias deducidas de cuatro señales. Esto es lo que evita
 * que la aplicación parezca tener una opinión tajante el primer día.
 */
export function profileTrust(profile: StyleProfile): number {
  const { established } = CONFIDENCE_THRESHOLDS
  return Number(Math.min(1, profile.signalCount / established).toFixed(3))
}

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

interface StoredProfile {
  style_weights: Record<string, number>
  color_weights: Record<string, number>
  fit_weights: Record<string, number>
  formality_bias: number
  signal_count: number
}

export function toStored(profile: StyleProfile): StoredProfile {
  const round = (record: Record<string, number>) =>
    Object.fromEntries(Object.entries(record).map(([k, v]) => [k, Number(v.toFixed(3))]))

  return {
    style_weights: round(profile.style),
    color_weights: round(profile.color),
    fit_weights: round(profile.fit),
    formality_bias: Number(profile.formalityBias.toFixed(3)),
    signal_count: profile.signalCount,
  }
}

/** Tolerante a propósito: una fila corrupta o antigua no debe tumbar la pantalla. */
export function fromStored(row: Partial<StoredProfile> | null | undefined): StyleProfile {
  const numbers = (value: unknown): Record<string, number> => {
    if (!value || typeof value !== 'object') return {}
    const result: Record<string, number> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) result[key] = parsed
    }
    return result
  }

  return {
    style: numbers(row?.style_weights),
    color: numbers(row?.color_weights),
    fit: numbers(row?.fit_weights),
    formalityBias: Number.isFinite(Number(row?.formality_bias))
      ? Number(row?.formality_bias)
      : 0,
    signalCount: Number.isFinite(Number(row?.signal_count)) ? Number(row?.signal_count) : 0,
  }
}
