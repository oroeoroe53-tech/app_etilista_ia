/**
 * Los retos de la semana.
 *
 * Un reto es una regla que te cambia cómo te vistes durante siete días. Tres
 * decisiones que los separan de la gamificación barata:
 *
 *  · **Los escribe la aplicación, no la gente.** Con retos libres, el primero
 *    que alguien inventa es «ponte algo rojo» y el segundo es una broma
 *    privada. Un catálogo corto y bueno vale más que infinitos malos.
 *  · **El progreso se calcula de lo que ya te has puesto**, no de marcar
 *    casillas. Nadie puede decir que ha completado un reto: o está en el
 *    historial o no está.
 *  · **Ninguno pide comprar nada.** Todos se ganan usando lo que ya tienes, que
 *    es de lo que va esta aplicación entera.
 *
 * El de cada semana sale del número de semana, así que a todo el mundo le toca
 * el mismo el mismo lunes. Es lo que permite que se hable de él.
 */

export interface Challenge {
  id: string
  name: string
  /** Una línea. Se lee en la tarjeta y tiene que explicar la regla entera. */
  description: string
  /** Cuántos días hay que cumplirla para completarlo. */
  target: number
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'forgotten',
    name: 'Solo prendas olvidadas',
    description: 'Cada día, algo que no te pones desde hace más de un mes.',
    target: 5,
  },
  {
    id: 'no_repeat',
    name: 'Sin repetir nada',
    description: 'Siete días sin ponerte dos veces la misma prenda.',
    target: 5,
  },
  {
    id: 'three_colors',
    name: 'Tres colores y basta',
    description: 'Toda la semana con tres colores como mucho.',
    target: 5,
  },
  {
    id: 'no_black',
    name: 'Una semana sin negro',
    description: 'A ver qué pasa cuando no está el comodín.',
    target: 5,
  },
]

/**
 * El lunes de la semana de una fecha, en ISO.
 *
 * Los retos van de lunes a domingo porque es como va la semana aquí, y porque
 * empezar en domingo dejaría el fin de semana partido en dos retos distintos.
 */
export function weekStart(date: Date = new Date()): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - weekday)
  return day.toISOString().slice(0, 10)
}

/**
 * El reto de esta semana.
 *
 * Sale de cuántas semanas han pasado desde una fecha fija, así que es el mismo
 * para todo el mundo y se puede saber cuál toca la semana que viene sin
 * guardar nada en ninguna parte.
 */
export function challengeOfWeek(date: Date = new Date()): Challenge {
  const weeks = Math.floor(Date.parse(weekStart(date)) / (7 * 86_400_000))
  return CHALLENGES[Math.abs(weeks) % CHALLENGES.length]!
}

/* --------------------------------------------------------------------------
 * El progreso
 * ----------------------------------------------------------------------- */

/** Una prenda puesta un día. Es lo que guarda `wear_history`, sin más. */
export interface WornEntry {
  day: string
  itemId: string
  color: string
}

export interface Progress {
  done: number
  target: number
  completed: boolean
}

/**
 * Cuánto llevas del reto.
 *
 * Todo se cuenta **por días**, no por prendas: un día en el que te pusiste tres
 * prendas olvidadas sigue siendo un día. Lo contrario premiaría vestirse con
 * mucha ropa, que no es la gracia.
 *
 * `forgotten` necesita saber qué prendas estaban olvidadas **antes** de la
 * semana, así que ese conjunto se calcula fuera y se pasa aquí: esta función no
 * consulta nada y por eso se puede probar entera.
 */
export function challengeProgress(
  challengeId: string,
  entries: readonly WornEntry[],
  forgottenIds: ReadonlySet<string> = new Set(),
): Progress {
  const challenge = CHALLENGES.find((c) => c.id === challengeId)
  const target = challenge?.target ?? 5

  const byDay = new Map<string, WornEntry[]>()
  for (const entry of entries) {
    const list = byDay.get(entry.day) ?? []
    list.push(entry)
    byDay.set(entry.day, list)
  }

  let done = 0

  switch (challengeId) {
    case 'forgotten':
      // Días en los que al menos una prenda venía del olvido.
      for (const day of byDay.values()) {
        if (day.some((entry) => forgottenIds.has(entry.itemId))) done++
      }
      break

    case 'no_repeat': {
      /*
       * Días sin repetir NADA de lo ya puesto esa semana.
       *
       * Se recorre en orden: el primer día siempre cuenta, y a partir de ahí un
       * día cuenta solo si ninguna de sus prendas salió antes. Contar prendas
       * distintas sin más dejaría pasar una semana entera con la misma camisa.
       */
      const seen = new Set<string>()
      for (const day of [...byDay.keys()].sort()) {
        const items = byDay.get(day)!
        if (items.every((entry) => !seen.has(entry.itemId))) done++
        for (const entry of items) seen.add(entry.itemId)
      }
      break
    }

    case 'three_colors': {
      // Días que no rompen el límite acumulado de tres colores en la semana.
      const palette = new Set<string>()
      for (const day of [...byDay.keys()].sort()) {
        for (const entry of byDay.get(day)!) palette.add(entry.color)
        if (palette.size <= 3) done++
        else break
      }
      break
    }

    case 'no_black':
      for (const day of byDay.values()) {
        if (day.every((entry) => entry.color !== 'black')) done++
      }
      break

    default:
      done = 0
  }

  return { done: Math.min(done, target), target, completed: done >= target }
}
