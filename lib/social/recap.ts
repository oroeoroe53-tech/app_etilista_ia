/**
 * El resumen del mes.
 *
 * Todo lo que sale aquí ya estaba guardado: días que te vestiste con lo que te
 * propuse, rachas, la prenda que más has usado. **No se añade ni una tabla ni
 * un contador nuevo**, y eso importa más de lo que parece: un resumen que
 * depende de contadores propios acaba enseñando números que no cuadran con el
 * historial el día que algo falle al escribirlos.
 *
 * Y no hay nada que presumir de comprar. La prenda estrella es la que más te
 * has puesto, no la más cara ni la más nueva.
 */

export interface RecapInput {
  /** Fechas de `wear_history` del mes, una por prenda puesta. */
  worn: readonly { day: string; itemId: string }[]
  /** Cómo se llama cada prenda, para poder decir cuál fue la estrella. */
  names: ReadonlyMap<string, string>
  /** Retos completados en el mes. */
  challengesDone: number
}

export interface Recap {
  /** Días distintos en que te vestiste con la aplicación. */
  days: number
  /** La racha más larga del mes. */
  bestStreak: number
  challengesDone: number
  star: { itemId: string; name: string; times: number } | null
  /** Nada que resumir todavía. */
  empty: boolean
}

export function buildRecap(input: RecapInput): Recap {
  const days = new Set(input.worn.map((w) => w.day))

  const counts = new Map<string, number>()
  for (const entry of input.worn) {
    counts.set(entry.itemId, (counts.get(entry.itemId) ?? 0) + 1)
  }

  let star: Recap['star'] = null
  for (const [itemId, times] of counts) {
    /*
     * Empate: gana la primera por orden de aparición, no al azar.
     *
     * Un resumen que enseña una prenda distinta cada vez que se abre parece
     * roto, aunque las dos sean igual de correctas.
     */
    if (!star || times > star.times) {
      star = { itemId, name: input.names.get(itemId) ?? 'Una prenda', times }
    }
  }

  // Una prenda puesta una sola vez no es la estrella de nada.
  if (star && star.times < 2) star = null

  return {
    days: days.size,
    bestStreak: longestStreak([...days]),
    challengesDone: input.challengesDone,
    star,
    empty: days.size === 0,
  }
}

/**
 * La racha más larga del mes.
 *
 * No se reutiliza `currentStreak`: aquella cuenta hacia atrás **desde el último
 * día con registro** para saber si la racha sigue viva hoy, que es otra
 * pregunta. Aquí se busca el tramo más largo del mes, haya terminado o no, así
 * que se recorren los días en orden y se mide cada tramo seguido.
 */
export function longestStreak(days: readonly string[]): number {
  const numbers = [...new Set(days)]
    .map((day) => Math.floor(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / 86_400_000))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)

  let best = 0
  let run = 0
  let previous: number | null = null

  for (const day of numbers) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1
    if (run > best) best = run
    previous = day
  }

  return best
}

/** «septiembre». El mes en palabras, para el titular. */
export function monthName(date: Date = new Date()): string {
  return date.toLocaleDateString('es-ES', { month: 'long' })
}
