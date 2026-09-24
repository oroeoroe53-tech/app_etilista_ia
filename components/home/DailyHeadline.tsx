import { dailyLookFor } from '@/lib/outfits/daily-request'

/**
 * La segunda línea del titular: «Hoy te veo *en neutros y una chaqueta*».
 *
 * Va aparte porque es lo único de la cabecera que depende del look, y el look
 * tarda: hay que preguntar el tiempo, cargar el armario y componer. Con esto,
 * la cabecera se pinta entera al instante y solo la cursiva llega después,
 * compartiendo el mismo cálculo que la tarjeta (`dailyLookFor`).
 */
export async function DailyHeadlineSecond({ userId }: { userId: string }) {
  const { look } = await dailyLookFor(userId)
  if (!look) return <span className="display-italic block">como tú quieras</span>

  // "Neutros y una chaqueta" → "en neutros y una chaqueta".
  const lowered = look.title.charAt(0).toLowerCase() + look.title.slice(1)
  return <span className="display-italic block">en {lowered}</span>
}

/**
 * El hueco mientras llega.
 *
 * Ocupa una línea entera, la misma que va a ocupar el texto, para que la
 * cabecera no dé un salto cuando aparezca.
 */
export function DailyHeadlineFallback() {
  return <span className="display-italic block opacity-0">en neutros</span>
}

/**
 * La temperatura, en la esquina de la cabecera.
 *
 * Comparte el mismo cálculo que el titular y la tarjeta: se pide una vez por
 * petición y se enseña en tres sitios.
 */
export async function DailyWeather({ userId }: { userId: string }) {
  const { weather } = await dailyLookFor(userId)
  if (!weather) return null

  return (
    <p className="shrink-0 pt-1 text-right text-small leading-[1.5] text-ink-soft">
      {Math.round(weather.temperatureC)}°
      <span className="block">{weather.description.toLowerCase()}</span>
    </p>
  )
}
