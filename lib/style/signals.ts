import { emptyProfile, type StyleProfile } from './profile'
import {
  SIGNAL_POINTS,
  DISLIKE_REASON_DIMENSIONS,
  FORMALITY_NUDGE,
  DIMENSIONS,
  type Dimension,
} from './weights'

/**
 * De hechos a perfil.
 *
 * Una señal es "esto pasó, y estos atributos estaban implicados". Aquí se
 * convierten en puntos. No hay ningún modelo de por medio: es sumar.
 */

export interface GarmentAttributes {
  styles: readonly string[]
  primary_color: string
  secondary_colors?: readonly string[]
  fit: string
  formality: number
}

export interface StyleSignal {
  points: number
  garments: readonly GarmentAttributes[]
  /** Dimensiones a las que se aplican los puntos. Por defecto, las tres. */
  dimensions?: readonly Dimension[]
  /** Empujón a la formalidad, de -1 a 1. */
  formalityNudge?: number
}

// ---------------------------------------------------------------------------
// Constructores de señal
// ---------------------------------------------------------------------------

/** La prenda está en el armario. */
export function ownershipSignal(garment: GarmentAttributes): StyleSignal {
  return { points: SIGNAL_POINTS.ownItem, garments: [garment] }
}

/** La prenda aparece en una foto que subió: la lleva de verdad, no solo la tiene. */
export function photoSignal(garment: GarmentAttributes, appearances: number): StyleSignal {
  return {
    points: SIGNAL_POINTS.photoAppearance * Math.min(appearances, 4),
    garments: [garment],
  }
}

/** Se la ha puesto. */
export function wearSignal(garment: GarmentAttributes, times: number): StyleSignal {
  return { points: SIGNAL_POINTS.wearItem * times, garments: [garment] }
}

/**
 * Reacción a un outfit completo.
 *
 * El motivo del rechazo decide a qué dimensión va el castigo: decir "no me gusta
 * el color" no debe ensuciar lo que sabemos de su estilo o de sus cortes.
 */
export function feedbackSignal(
  garments: readonly GarmentAttributes[],
  reaction: 'like' | 'love' | 'dislike' | 'skip',
  reason?: string | null,
): StyleSignal {
  if (reaction === 'skip') {
    return { points: SIGNAL_POINTS.outfitSkip, garments, dimensions: [] }
  }

  if (reaction === 'like') return { points: SIGNAL_POINTS.outfitLike, garments }
  if (reaction === 'love') return { points: SIGNAL_POINTS.outfitLove, garments }

  const dimensions = reason ? DISLIKE_REASON_DIMENSIONS[reason] : undefined

  // "Demasiado formal" / "demasiado informal" no penalizan atributos:
  // mueven la formalidad preferida, que es lo que la persona está diciendo.
  const formalityNudge =
    reason === 'too_formal' ? -FORMALITY_NUDGE : reason === 'too_casual' ? FORMALITY_NUDGE : 0

  return {
    points: SIGNAL_POINTS.outfitDislike,
    garments,
    dimensions: dimensions ?? DIMENSIONS,
    formalityNudge,
  }
}

// ---------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------

function add(record: Record<string, number>, key: string, points: number) {
  if (!key) return
  record[key] = (record[key] ?? 0) + points
}

/**
 * Aplica una tanda de señales sobre un perfil y devuelve uno nuevo.
 *
 * Función pura: mismas señales, mismo resultado. Eso permite recalcular el perfil
 * entero desde cero cuando haga falta, sin miedo a que se desvíe.
 */
export function applySignals(
  base: StyleProfile,
  signals: readonly StyleSignal[],
): StyleProfile {
  const profile: StyleProfile = {
    style: { ...base.style },
    color: { ...base.color },
    fit: { ...base.fit },
    formalityBias: base.formalityBias,
    signalCount: base.signalCount,
  }

  for (const signal of signals) {
    const dimensions = signal.dimensions ?? DIMENSIONS

    if (signal.formalityNudge) {
      profile.formalityBias = clamp(profile.formalityBias + signal.formalityNudge, -1, 1)
    }

    // Una señal cuenta como una, aunque mueva varios atributos.
    profile.signalCount++

    if (signal.points === 0 || dimensions.length === 0) continue

    // Los puntos se reparten entre las prendas del outfit: un look de cuatro
    // piezas no debe valer cuatro veces más que uno de dos.
    const perGarment = signal.points / Math.max(1, signal.garments.length)

    for (const garment of signal.garments) {
      if (dimensions.includes('style')) {
        // Y entre los estilos de la prenda, por el mismo motivo.
        const share = perGarment / Math.max(1, garment.styles.length)
        for (const style of garment.styles) add(profile.style, style, share)
      }

      if (dimensions.includes('color')) {
        add(profile.color, garment.primary_color, perGarment)
        // Los colores secundarios cuentan a un tercio: están, pero no mandan.
        for (const secondary of garment.secondary_colors ?? []) {
          add(profile.color, secondary, perGarment / 3)
        }
      }

      if (dimensions.includes('fit')) {
        // "Sin determinar" y "normal" no son preferencias, son ausencia de dato.
        if (garment.fit && garment.fit !== 'unknown' && garment.fit !== 'regular') {
          add(profile.fit, garment.fit, perGarment)
        }
      }
    }
  }

  return profile
}

/**
 * Formalidad media de un conjunto de prendas, llevada a la escala -1…1.
 *
 * Se calcula aparte del sistema de puntos porque la formalidad es un promedio,
 * no una acumulación: tener diez camisetas de estar por casa no hace a nadie
 * "diez veces informal".
 */
export function formalityBiasFrom(garments: readonly GarmentAttributes[]): number {
  if (garments.length === 0) return 0
  const average = garments.reduce((sum, g) => sum + g.formality, 0) / garments.length
  // 1..5 → -1..1, con 3 como centro.
  return clamp(Number(((average - 3) / 2).toFixed(3)), -1, 1)
}

export function buildProfile(signals: readonly StyleSignal[]): StyleProfile {
  return applySignals(emptyProfile(), signals)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
