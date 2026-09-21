/**
 * La racha: cuántos días seguidos te has puesto lo que te propuso.
 *
 * El diseño la enseña grande, en serif de 44px, y tiene razón: es el único
 * número de la aplicación que crece solo por usarla. Pero un número así
 * miente con facilidad, así que las reglas están escritas aquí y probadas:
 *
 *  · **Sale de `wear_history`**, no de una tabla nueva de rachas. El dato ya
 *    existe —cada vez que alguien marca un look como puesto— y una tabla
 *    aparte sería una segunda versión de la verdad que algún día se desviaría
 *    de la primera.
 *  · **Hoy todavía no ha terminado.** Si aún no te has puesto nada hoy, la
 *    racha de ayer sigue viva: cortarla a las 00:01 sería castigar a alguien
 *    por no haberse vestido a esa hora.
 *  · **Se cuenta hacia atrás desde el último día con registro**, y se para en
 *    el primer hueco. Sin trampas: un día sin ponerse nada rompe la racha, que
 *    es lo que hace que el número signifique algo.
 *  · **Varias prendas el mismo día cuentan una vez.** Es una racha de días, no
 *    de prendas.
 */

const DAY_MS = 86_400_000

/** `2026-09-21` → días desde la época. Sin horas: aquí solo existen los días. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return NaN
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

export function currentStreak(wornDates: readonly string[], today: Date = new Date()): number {
  const days = [...new Set(wornDates.map(dayNumber).filter((n) => !Number.isNaN(n)))].sort(
    (a, b) => b - a,
  )

  const first = days[0]
  if (first === undefined) return 0

  const todayNumber = Math.floor(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / DAY_MS,
  )

  /*
   * El último registro tiene que ser de hoy o de ayer.
   *
   * De hoy: la racha va por hoy. De ayer: el día no ha terminado, sigue viva.
   * De antes de ayer: ya se rompió, y enseñar el número viejo sería mentir.
   */
  if (first < todayNumber - 1) return 0

  let streak = 1
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1]! - 1) streak++
    else break
  }
  return streak
}

/**
 * Los siete puntos de la semana que pinta el diseño.
 *
 * De lunes a domingo, el de hoy marcado aparte. Se devuelve el estado y no una
 * clase de CSS: quien pinta decide cómo se ve, y esto solo sabe qué pasó.
 */
export type DayState = 'done' | 'missed' | 'today' | 'future'

export function weekStates(
  wornDates: readonly string[],
  today: Date = new Date(),
): DayState[] {
  const done = new Set(wornDates.map(dayNumber))

  const todayNumber = Math.floor(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / DAY_MS,
  )

  // Lunes como primer día: es la semana española, no la del calendario inglés.
  const weekday = (today.getUTCDay() + 6) % 7
  const monday = todayNumber - weekday

  const states: DayState[] = []
  for (let i = 0; i < 7; i++) {
    const day = monday + i
    if (done.has(day)) states.push('done')
    else if (day === todayNumber) states.push('today')
    else if (day > todayNumber) states.push('future')
    else states.push('missed')
  }
  return states
}

/**
 * Desde cuándo pedir el historial para calcular la racha.
 *
 * Sesenta días: ninguna pantalla enseña una racha más larga que eso y traerse
 * el historial entero por un número sería caro. Vive aquí, y no dentro de la
 * pantalla, por la misma razón que `neglectCutoffs()`: leer el reloj dentro de
 * un componente lo vuelve impuro, y el linter lo prohíbe con razón.
 */
export function streakWindowStart(today: Date = new Date()): string {
  return new Date(today.getTime() - 60 * DAY_MS).toISOString().slice(0, 10)
}
