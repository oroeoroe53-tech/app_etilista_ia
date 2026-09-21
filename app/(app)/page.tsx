import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { fetchWeather } from '@/lib/weather/provider'
import { getDailyLook } from '@/lib/outfits/daily'
import { findNeglected, neglectMessage, neglectCutoffs } from '@/lib/wardrobe/neglected'
import { describeGarment } from '@/lib/wardrobe/labels'
import { listMyPolls } from '@/lib/polls/queries'
import { TodayLook } from '@/components/home/TodayLook'
import { Countdown } from '@/components/polls/Countdown'
import { PhotoSlot, QuietRow } from '@/components/ui'

/**
 * Portada.
 *
 * No es un menú: es lo que te pones hoy. La pantalla responde a la única
 * pregunta por la que alguien abre esta aplicación por la mañana, y todo lo
 * demás —el armario, Descubre— queda como acceso, no como destino.
 *
 * El look no se pide: ya está hecho cuando llegas. Cómo se compone sin gastar
 * cupo ni llamar a ningún modelo está explicado en `lib/outfits/daily.ts`.
 */
export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const cutoffs = neglectCutoffs()

  const [{ data: profile }, { count: itemCount }, { data: prefsRow }, { data: strip }, { data: forNeglect }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('display_name, onboarding_stage')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('clothing_items')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null),
      supabase.from('user_preferences').select('city, lat, lon').eq('user_id', user.id).maybeSingle(),
      // La tira del armario: cinco prendas, las últimas en entrar.
      supabase
        .from('clothing_items')
        .select('id, category, primary_color, fit, pattern, image_path')
        .is('deleted_at', null)
        .eq('is_available', true)
        .order('created_at', { ascending: false })
        .limit(5),
      /*
       * Solo las candidatas a estar olvidadas, no el armario entero.
       *
       * Las fechas de corte salen de las mismas reglas que luego deciden, así
       * que el filtro y la lógica no se pueden desajustar.
       */
      supabase
        .from('clothing_items')
        .select(
          'id, category, primary_color, fit, pattern, image_path, seasons, is_available, times_worn, last_worn_at, created_at',
        )
        .is('deleted_at', null)
        .eq('is_available', true)
        .or(`last_worn_at.lt.${cutoffs.lastWornBefore},last_worn_at.is.null`)
        .order('last_worn_at', { ascending: true, nullsFirst: false })
        .limit(40),
    ])

  const row = profile as { display_name?: string | null; onboarding_stage?: string } | null
  const onboardingDone = row?.onboarding_stage === 'completed'
  const prendas = itemCount ?? 0

  const prefs = (prefsRow ?? {}) as { city?: string | null; lat?: number | null; lon?: number | null }

  // Si la API del tiempo falla, la pantalla funciona igual: el dato desaparece
  // de la esquina y el motor compone sin temperatura (PLAN.md §35).
  const weather =
    prefs.lat != null && prefs.lon != null
      ? await fetchWeather({ lat: prefs.lat, lon: prefs.lon })
      : null

  const look = prendas > 0 ? await getDailyLook(supabase, user.id, weather) : null

  // Una sola prenda olvidada, la que más tiempo lleve. Una lista aquí sería ruido.
  const olvidada = findNeglected((forNeglect ?? []) as never[], new Date(), 1)[0] ?? null

  const stripItems = (strip ?? []) as Array<{
    id: string
    category: string
    primary_color: string
    fit: string | null
    pattern: string | null
    image_path: string | null
  }>

  // Una sola firma para las fotos del look y las de la tira.
  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    [
      ...(look?.items.map((i) => i.imagePath) ?? []),
      ...stripItems.map((i) => i.image_path),
    ].filter((p): p is string => Boolean(p)),
    user.id,
  )

  /*
   * La votación abierta, si la hay.
   *
   * Después de las consultas pesadas y sin bloquearlas: es una fila de adorno
   * comparada con el look del día, y si fallara no debería costarle la portada
   * a nadie.
   */
  const openPoll = (await listMyPolls(user.id)).find((poll) => !poll.closed) ?? null

  const today = new Date()
  const fecha = `${today.toLocaleDateString('es-ES', { weekday: 'long' })} ${today.getDate()}`
  const lugar = prefs.city ? ` · ${prefs.city}` : ''

  const headline = titleFor({ prendas, look })

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      {/* --- Cabecera ---------------------------------------------------- */}
      <header className="flex items-start justify-between gap-4 pt-5">
        <div className="min-w-0">
          <p className="eyebrow">
            {fecha}
            {lugar}
          </p>
          <h1 className="display mt-2.5 text-[33px] leading-[1.05]">
            {headline.first}
            <span className="display-italic mt-0.5 block">{headline.second}</span>
          </h1>
        </div>

        {weather ? (
          <p className="shrink-0 pt-1 text-right text-[11px] leading-[1.5] text-ink-soft">
            {Math.round(weather.temperatureC)}°
            <span className="block">{weather.description.toLowerCase()}</span>
          </p>
        ) : null}
      </header>

      {/* --- El look de hoy ---------------------------------------------- */}
      {look ? (
        <TodayLook
          look={{
            outfitId: look.outfitId,
            title: look.title,
            explanation: look.explanation,
            match: look.match,
            items: look.items.map((item) => ({
              id: item.id,
              name: item.name,
              imageUrl: item.imagePath ? (signed.get(item.imagePath) ?? null) : null,
            })),
          }}
        />
      ) : (
        <Link
          href={prendas === 0 ? '/onboarding' : '/outfits/que-me-pongo'}
          className="mt-5 block rounded-[var(--radius-card)] bg-accent p-5 text-accent-ink"
        >
          <span className="eyebrow block text-accent-ink/55">
            {prendas === 0 ? 'Primer paso' : 'Ahora mismo'}
          </span>
          <span className="display mt-2 block text-[26px]">
            {prendas === 0 ? 'Enséñame cómo vistes' : '¿Qué me pongo?'}
          </span>
          <span className="mt-2 block text-[11.5px] leading-[1.5] opacity-70">
            {prendas === 0
              ? 'Cinco o seis fotos de looks que ya lleves. Valen las del espejo.'
              : 'Con lo que hay disponible no consigo montar nada solo. Dime la ocasión y lo intento contigo.'}
          </span>
        </Link>
      )}

      {/* --- Sin prisa ---------------------------------------------------- */}
      <Link
        href="/outfits/swipe"
        className="mt-3.5 flex items-center justify-between gap-4 rounded-[18px] border border-line px-4 py-[15px]"
      >
        <span className="min-w-0">
          <span className="eyebrow block">Sin prisa</span>
          <span className="display mt-1 block text-[18px]">¿Te pondrías esto?</span>
        </span>
        <span aria-hidden className="shrink-0 text-[13px] text-ink-faint">
          →
        </span>
      </Link>

      {/* --- Lo que se te olvida ------------------------------------------
          No está en el diseño, y se queda igualmente: es una de las cosas que
          hace la aplicación y no tiene otro sitio donde asomar. Va en una línea
          fina para que no compita con la tarjeta de arriba. */}
      {olvidada ? (
        <Link
          href={`/armario/${olvidada.id}`}
          className="mt-3.5 block border-l-2 border-clay py-1.5 pl-3.5"
        >
          <span className="eyebrow block">Se te olvida</span>
          <span className="mt-1 block text-[11.5px] leading-[1.5] text-ink-soft">
            {neglectMessage(olvidada, describeGarment(olvidada))}
          </span>
        </Link>
      ) : null}

      {!onboardingDone && prendas > 0 ? (
        <Link
          href="/onboarding"
          className="mt-3.5 block border-l-2 border-line py-1.5 pl-3.5"
        >
          <span className="eyebrow block">Sin terminar</span>
          <span className="mt-1 block text-[11.5px] leading-[1.5] text-ink-soft">
            Quedaron fotos por analizar. Cuantas más vea, mejor te entiendo.
          </span>
        </Link>
      ) : null}

      {/* --- Tu armario --------------------------------------------------- */}
      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="display text-[15px]">Tu armario · {prendas}</h2>
          <Link href="/armario" className="text-[10.5px] whitespace-nowrap text-ink-faint">
            ver todo
          </Link>
        </div>

        <ul className="no-scrollbar bleed-row flex gap-[7px] overflow-x-auto pb-1">
          {stripItems.map((item) => {
            const nombre = describeGarment(item)
            return (
              <li key={item.id} className="shrink-0">
                <Link href={`/armario/${item.id}`} className="block">
                  <PhotoSlot
                    src={item.image_path ? (signed.get(item.image_path) ?? null) : null}
                    label={nombre}
                    showLabel={false}
                    className="h-[70px] w-14 rounded-xl"
                  />
                </Link>
              </li>
            )
          })}

          <li className="shrink-0">
            <Link
              href="/armario/nueva"
              aria-label="Añadir una prenda"
              className="flex h-[70px] w-14 items-center justify-center rounded-xl border border-dashed border-line text-lg text-ink-faint"
            >
              +
            </Link>
          </li>
        </ul>
      </section>

      {/*
        El diario y la maleta.

        El rediseño no les daba sitio en la portada y se quedaron colgando solo
        de la pantalla de Outfits, donde hay que ir a buscarlos a propósito. Eso
        es lo mismo que haberlos quitado: lo que no se ve al abrir, no existe.

        Vuelven aquí abajo, en filas finas, después de lo que sí responde a la
        pregunta del día. Presentes sin discutirle el sitio a la tarjeta.
      */}
      <nav className="mt-7">
        {/*
          La votación en curso, si la hay.

          Cuando alguien tiene una votación abierta, es lo único de esta pantalla
          que está pasando AHORA: hay gente contestando y quedan minutos. Por eso
          se cuela por encima del diario, con el tiempo corriendo, y desaparece
          sola en cuanto se cierra.
        */}
        {openPoll ? (
          <Link
            href={`/v/${openPoll.token}`}
            className="flex items-center justify-between gap-4 border-t border-line py-3.5"
          >
            <span className="min-w-0">
              <span className="display block text-[17px]">Tu votación</span>
              <span className="mt-0.5 block truncate text-[11px] text-ink-soft">
                {openPoll.totalVotes === 0
                  ? 'Todavía no ha votado nadie'
                  : openPoll.totalVotes === 1
                    ? '1 voto'
                    : `${openPoll.totalVotes} votos`}
              </span>
            </span>
            <Countdown closesAt={openPoll.closesAt} onZeroRefresh={false} className="shrink-0 text-[13px]" />
          </Link>
        ) : (
          <QuietRow href="/votacion/nueva" title="¿Cuál me pongo?">
            Que lo decidan tus amigas, en minutos
          </QuietRow>
        )}
        <QuietRow href="/diario" title="Diario">
          Lo que te has ido poniendo
        </QuietRow>
        <QuietRow href="/outfits/maleta" title="La maleta">
          Qué meter para un viaje
        </QuietRow>
      </nav>
    </div>
  )
}

/**
 * El titular de la portada.
 *
 * Dos líneas, la segunda en cursiva. La cursiva no es decoración: es la que
 * lleva lo que cambia cada día, y por eso la primera línea puede quedarse
 * quieta sin que la pantalla parezca la misma de ayer.
 */
function titleFor({
  prendas,
  look,
}: {
  prendas: number
  look: { title: string } | null
}): { first: string; second: string } {
  if (prendas === 0) return { first: 'Enséñame', second: 'cómo vistes' }
  if (!look) return { first: 'Hoy te veo', second: 'como tú quieras' }

  // "Neutros y una chaqueta" → "en neutros y una chaqueta".
  const lowered = look.title.charAt(0).toLowerCase() + look.title.slice(1)
  return { first: 'Hoy te veo', second: `en ${lowered}` }
}
