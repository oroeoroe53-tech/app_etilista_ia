import { seasonOf } from '@/lib/outfits/filters'
import type { Season } from './taxonomy'

/**
 * Prendas olvidadas.
 *
 * "Llevas cuarenta y siete días sin ponerte la chaqueta verde." Es de las cosas
 * más útiles que puede decir un estilista, y sale entera de datos que ya
 * tenemos: no cuesta ni una llamada de IA (PLAN.md §26).
 *
 * Lo delicado no es el cálculo, es **cuándo callarse**. Recordarle a alguien en
 * agosto que no se pone el abrigo de plumas no es un consejo, es ruido, y basta
 * un par de avisos así para que deje de leerlos.
 */

export interface NeglectedCandidate {
  id: string
  category: string
  primary_color: string
  fit?: string | null
  pattern?: string | null
  image_path: string | null
  seasons: string[]
  is_available: boolean
  times_worn: number
  last_worn_at: string | null
  created_at: string
}

export interface NeglectedItem extends NeglectedCandidate {
  /** Días desde la última vez. `null` si nunca se ha puesto. */
  daysSince: number | null
  /** Días que lleva en el armario. */
  daysOwned: number
  reason: 'never_worn' | 'long_unworn'
}

export const NEGLECT_RULES = {
  /** Días sin ponerse una prenda antes de mencionarla. */
  unwornDays: 30,
  /** Días que debe llevar en el armario una prenda nunca usada antes de mencionarla. */
  newItemGrace: 21,
  /** Cuántas mencionar como mucho. Una lista larga se ignora entera. */
  maxSuggestions: 3,
} as const

function daysBetween(from: string | null, to: Date): number | null {
  if (!from) return null
  const date = new Date(from)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((to.getTime() - date.getTime()) / 86_400_000))
}

/**
 * ¿Toca esta prenda ahora mismo?
 *
 * Una prenda de invierno en julio no está olvidada: está guardada, que es lo
 * normal. Las prendas sin temporada marcada valen siempre.
 */
function inSeason(item: NeglectedCandidate, season: Season): boolean {
  if (item.seasons.length === 0) return true
  return item.seasons.includes(season)
}

export function findNeglected(
  items: readonly NeglectedCandidate[],
  today: Date = new Date(),
  // El tipo va explícito: `NEGLECT_RULES` es `as const`, así que sin esto el
  // parámetro se inferiría como el literal `3` y no admitiría ningún otro valor.
  limit: number = NEGLECT_RULES.maxSuggestions,
): NeglectedItem[] {
  const season = seasonOf(today)

  const candidates: NeglectedItem[] = []

  for (const item of items) {
    // Lo que está guardado a propósito no es un olvido.
    if (!item.is_available) continue
    if (!inSeason(item, season)) continue

    const daysOwned = daysBetween(item.created_at, today) ?? 0
    const daysSince = daysBetween(item.last_worn_at, today)

    if (item.times_worn === 0 || daysSince === null) {
      // Una prenda recién añadida todavía no está olvidada.
      if (daysOwned < NEGLECT_RULES.newItemGrace) continue
      candidates.push({ ...item, daysSince: null, daysOwned, reason: 'never_worn' })
      continue
    }

    if (daysSince >= NEGLECT_RULES.unwornDays) {
      candidates.push({ ...item, daysSince, daysOwned, reason: 'long_unworn' })
    }
  }

  // Primero lo que más tiempo lleva sin salir. Lo nunca usado va al principio.
  return candidates
    .sort((a, b) => {
      const aDays = a.daysSince ?? Number.MAX_SAFE_INTEGER
      const bDays = b.daysSince ?? Number.MAX_SAFE_INTEGER
      return bDays - aDays || a.id.localeCompare(b.id)
    })
    .slice(0, limit)
}

/** Frase para la interfaz. Sin reproche: informa, no regaña. */
export function neglectMessage(item: NeglectedItem, name: string): string {
  if (item.reason === 'never_worn') {
    return `${name} lleva ${item.daysOwned} días en tu armario y todavía no ha salido.`
  }
  const days = item.daysSince ?? 0
  if (days >= 180) return `Hace más de medio año que no te pones ${name.toLowerCase()}.`
  if (days >= 90) return `Hace más de tres meses que no te pones ${name.toLowerCase()}.`
  return `Llevas ${days} días sin ponerte ${name.toLowerCase()}.`
}
