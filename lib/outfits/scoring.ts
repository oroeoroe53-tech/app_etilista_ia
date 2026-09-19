import { affinityOf, profileTrust, type StyleProfile } from '@/lib/style/profile'
import { analyzePalette, patternPenalty } from './color'
import { targetFormality, temperatureBand } from './filters'
import { NOVELTY_DECAY_DAYS, SCORE_WEIGHTS } from './weights'
import { itemsOf, type OutfitCandidate, type OutfitContext, type ScoreBreakdown, type ScoredOutfit, type WardrobeItem } from './types'

/**
 * Puntuación de un outfit.
 *
 * Seis componentes, cada uno de 0 a 1, combinados con los pesos de `weights.ts`.
 * Todo es aritmética: ninguna parte de esto llama a un modelo.
 *
 * Un detalle que importa: el peso de las preferencias personales se escala por
 * la confianza que merece el perfil. Con cuatro señales, el sistema no tiene
 * derecho a tener una opinión tajante sobre el gusto de nadie, y lo que sobra se
 * reparte entre lo objetivo: la ocasión y el tiempo.
 */

export interface ScoringInput {
  profile: StyleProfile
  context: OutfitContext
  dislikedColors?: readonly string[]
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function colorScore(items: readonly WardrobeItem[]): { score: number; note: string | null } {
  const palette = analyzePalette(items)
  const penalty = patternPenalty(items.map((i) => i.pattern))
  return { score: Math.max(0, palette.score - penalty), note: palette.note }
}

/**
 * Coherencia estética: ¿estas piezas pertenecen al mismo registro?
 *
 * Se mide por el solape de estilos entre prendas. Una americana de oficina con
 * un pantalón de chándal no comparten ninguno, y eso es exactamente lo que el
 * número tiene que reflejar.
 */
function styleScore(items: readonly WardrobeItem[]): number {
  const withStyles = items.filter((item) => item.styles.length > 0)
  if (withStyles.length < 2) return 0.6 // sin datos no se premia ni se castiga

  let total = 0
  let pairs = 0

  for (let i = 0; i < withStyles.length; i++) {
    for (let j = i + 1; j < withStyles.length; j++) {
      const a = new Set(withStyles[i]!.styles as string[])
      const b = withStyles[j]!.styles as string[]
      const shared = b.filter((style) => a.has(style)).length
      total += shared / Math.max(a.size, b.length)
      pairs++
    }
  }

  return pairs === 0 ? 0.6 : Number((total / pairs).toFixed(4))
}

/**
 * Ocasión: cercanía a la formalidad buscada y coherencia interna.
 *
 * Lo segundo importa tanto como lo primero. Un conjunto con una prenda de
 * etiqueta y otra de estar por casa puede dar una media correcta y ser un
 * despropósito, así que la dispersión penaliza por separado.
 */
function occasionScore(items: readonly WardrobeItem[], target: number): number {
  const formalities = items.map((item) => item.formality)
  const mean = average(formalities)

  const distance = Math.abs(mean - target) / 4
  const spread = (Math.max(...formalities) - Math.min(...formalities)) / 4

  return Number(Math.max(0, 1 - distance * 0.7 - spread * 0.5).toFixed(4))
}

function weatherScore(items: readonly WardrobeItem[], context: OutfitContext): number {
  if (context.temperatureC === undefined) return 0.7 // sin dato, ni premio ni castigo

  const band = temperatureBand(context.temperatureC)
  const [min, max] = band.warmth
  const center = (min + max) / 2

  // Lo que manda es el abrigo medio del conjunto: unos calcetines finos no
  // cancelan un plumas, pero tampoco lo convierten en ropa de verano.
  const mean = average(items.map((item) => item.warmth))
  const distance = Math.abs(mean - center) / 2.5

  let score = Math.max(0, 1 - distance)

  if (band.outerRequired && !items.some((item) => item.warmth >= 4)) {
    score *= 0.6 // hace frío y no hay nada que abrigue de verdad
  }

  return Number(score.toFixed(4))
}

/** Cuánto le gusta a ESTA persona lo que hay en el look. */
function preferenceScore(
  items: readonly WardrobeItem[],
  profile: StyleProfile,
  dislikedColors: readonly string[],
): number {
  const affinities: number[] = []

  for (const item of items) {
    affinities.push(affinityOf(profile, 'color', item.primary_color))
    if (item.fit !== 'unknown' && item.fit !== 'regular') {
      affinities.push(affinityOf(profile, 'fit', item.fit))
    }
    for (const style of item.styles) {
      affinities.push(affinityOf(profile, 'style', style))
    }
  }

  // Las afinidades van de -1 a 1; se llevan a 0–1.
  const mean = average(affinities)
  let score = (mean + 1) / 2

  // Un color vetado expresamente hunde el look aunque todo lo demás encaje:
  // lo que la persona dice manda sobre lo que el sistema deduce.
  if (items.some((item) => dislikedColors.includes(item.primary_color))) {
    score *= 0.25
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(4))
}

/**
 * Novedad: cuánto hace que no se lleva esto.
 *
 * Evita que la aplicación proponga lo mismo un martes tras otro solo porque es
 * lo que mejor puntúa (PLAN.md §22).
 */
function noveltyScore(items: readonly WardrobeItem[], today: Date): number {
  const scores = items.map((item) => {
    if (!item.last_worn_at) return 1 // nunca puesta: novedad máxima
    const worn = new Date(item.last_worn_at)
    if (Number.isNaN(worn.getTime())) return 1
    const days = Math.max(0, (today.getTime() - worn.getTime()) / 86_400_000)
    return Math.min(1, days / NOVELTY_DECAY_DAYS)
  })

  return Number(average(scores).toFixed(4))
}

// ---------------------------------------------------------------------------
// Conjunto
// ---------------------------------------------------------------------------

/**
 * Pesos efectivos.
 *
 * El peso de las preferencias se escala por la confianza del perfil, y lo que se
 * le quita va a la ocasión y al tiempo, que son objetivos. Así, con un perfil
 * recién nacido la aplicación se apoya en lo que sabe de verdad en lugar de
 * fingir que ya conoce a la persona.
 */
export function effectiveWeights(profile: StyleProfile) {
  const trust = profileTrust(profile)
  const preference = SCORE_WEIGHTS.preference * trust
  const freed = SCORE_WEIGHTS.preference - preference

  return {
    color: SCORE_WEIGHTS.color,
    style: SCORE_WEIGHTS.style,
    occasion: SCORE_WEIGHTS.occasion + freed * 0.6,
    weather: SCORE_WEIGHTS.weather + freed * 0.4,
    preference,
    novelty: SCORE_WEIGHTS.novelty,
  }
}

export function scoreCandidate(
  candidate: OutfitCandidate,
  input: ScoringInput,
): ScoredOutfit {
  const items = itemsOf(candidate)
  const today = input.context.today ?? new Date()
  const target = targetFormality(input.context, input.profile.formalityBias)

  const color = colorScore(items)
  const breakdown: ScoreBreakdown = {
    color: color.score,
    style: styleScore(items),
    occasion: occasionScore(items, target),
    weather: weatherScore(items, input.context),
    preference: preferenceScore(items, input.profile, input.dislikedColors ?? []),
    novelty: noveltyScore(items, today),
  }

  const weights = effectiveWeights(input.profile)
  const score = Number(
    (Object.keys(breakdown) as Array<keyof ScoreBreakdown>)
      .reduce((sum, key) => sum + breakdown[key] * weights[key], 0)
      .toFixed(4),
  )

  return {
    items,
    candidate,
    score,
    breakdown,
    highlights: buildHighlights(breakdown, color.note, input, items),
  }
}

/**
 * Motivos legibles de por qué este look funciona.
 *
 * Es lo único que se le pasará al modelo en la Fase 6 para que redacte la frase.
 * Al dárselo ya masticado, no puede inventarse razones que el sistema no ha
 * usado, que es justo lo que haría si se le entregara el outfit a pelo.
 */
function buildHighlights(
  breakdown: ScoreBreakdown,
  colorNote: string | null,
  input: ScoringInput,
  items: readonly WardrobeItem[],
): string[] {
  const highlights: string[] = []

  if (colorNote && breakdown.color >= 0.8) highlights.push(colorNote)
  if (breakdown.style >= 0.6) highlights.push('las piezas van en la misma línea')

  if (breakdown.weather >= 0.8 && input.context.temperatureC !== undefined) {
    highlights.push(`adecuado para ${Math.round(input.context.temperatureC)} grados`)
  }
  if (input.context.rain) highlights.push('aguanta la lluvia')

  if (breakdown.preference >= 0.65 && profileTrust(input.profile) > 0.3) {
    highlights.push('encaja con lo que sueles llevar')
  }

  if (breakdown.novelty >= 0.9 && items.some((item) => !item.last_worn_at)) {
    highlights.push('incluye algo que no te has puesto todavía')
  }

  if (input.context.occasion === 'work' && breakdown.occasion >= 0.75) {
    highlights.push('vale para la oficina')
  }

  return highlights
}
