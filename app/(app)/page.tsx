import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient, requireUserId } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { findNeglected, neglectMessage, neglectCutoffs } from '@/lib/wardrobe/neglected'
import { describeGarment } from '@/lib/wardrobe/labels'
import { getSocialSummary } from '@/lib/social/summary'
import { DailyLookSection, DailyLookSkeleton } from '@/components/home/DailyLookSection'
import {
  DailyHeadlineSecond,
  DailyHeadlineFallback,
  DailyWeather,
} from '@/components/home/DailyHeadline'
import { Countdown } from '@/components/polls/Countdown'
import { HeaderLight, PhotoSlot, QuietRow } from '@/components/ui'

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
  /*
   * El identificador viene del proxy, que ya validó la sesión en esta misma
   * petición. Volver a pedírselo a Supabase aquí era un viaje de ida y vuelta
   * regalado en cada navegación (ver `lib/supabase/server.ts`).
   */
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    redirect('/login')
  }

  const supabase = await createClient()
  const cutoffs = neglectCutoffs()

  const [{ data: profile }, { count: itemCount }, { data: prefsRow }, { data: strip }, { data: forNeglect }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('display_name, onboarding_stage')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('clothing_items')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null),
      supabase.from('user_preferences').select('city, lat, lon').eq('user_id', userId).maybeSingle(),
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

  /*
   * Las dos últimas esperas, a la vez.
   *
   * Firmar las fotos de la tira y pedir el resumen social no dependen la una de
   * la otra, así que encadenarlas era sumar dos viajes donde cabe uno.
   */
  const [signed, summary] = await Promise.all([
    signMany(
      supabase,
      BUCKETS.clothing,
      stripItems.map((i) => i.image_path).filter((p): p is string => Boolean(p)),
      userId,
    ),
    getSocialSummary(supabase, userId),
  ])

  const openPoll = summary.openPoll

  const today = new Date()
  const fecha = `${today.toLocaleDateString('es-ES', { weekday: 'long' })} ${today.getDate()}`
  const lugar = prefs.city ? ` · ${prefs.city}` : ''

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      {/* --- Cabecera ---------------------------------------------------- */}
      {/*
        La cabecera lleva la luz detrás. `relative` es lo que la sostiene, y el
        contenido va con `relative` propio para quedar por delante de ella.
      */}
      <header className="relative flex items-start justify-between gap-4 pt-5">
        <HeaderLight />
        <div className="relative min-w-0">
          <p className="eyebrow">
            {fecha}
            {lugar}
          </p>
          <h1 className="display mt-2.5 text-display leading-[1.05]">
            {prendas === 0 ? 'Enséñame' : 'Hoy te veo'}
            {/*
              La segunda línea depende del look, y el look tarda. Se transmite
              aparte para que la cabecera aparezca entera desde el primer
              instante: `DailyHeadlineFallback` ocupa exactamente su sitio.
            */}
            {prendas === 0 ? (
              <span className="display-italic mt-0.5 block">cómo vistes</span>
            ) : (
              <Suspense fallback={<DailyHeadlineFallback />}>
                <DailyHeadlineSecond userId={userId} />
              </Suspense>
            )}
          </h1>
        </div>

        <div className="relative">
          <Suspense fallback={null}>
            <DailyWeather userId={userId} />
          </Suspense>
        </div>
      </header>

      {/* --- El look de hoy ---------------------------------------------- */}
      {/*
        En streaming.

        Es la parte cara de esta pantalla —API del tiempo, armario entero,
        motor— y antes la portada no enseñaba nada hasta que terminaba. Ahora
        aparece todo lo demás y el look llega detrás, en un hueco de su mismo
        tamaño para que no salte nada.
      */}
      {prendas > 0 ? (
        <Suspense fallback={<DailyLookSkeleton />}>
          <DailyLookSection
            userId={userId}
            hasWardrobe
            circleCount={summary.circleCount}
            sharedToday={summary.sharedToday}
          />
        </Suspense>
      ) : (
        <Link
          href="/onboarding"
          className="mt-5 block rounded-[var(--radius-card)] bg-accent p-5 text-accent-ink"
        >
          <span className="eyebrow block text-accent-ink/55">Primer paso</span>
          <span className="display mt-2 block text-display-s">Enséñame cómo vistes</span>
          <span className="mt-2 block text-small leading-[1.5] opacity-70">
            Cinco o seis fotos de looks que ya lleves. Valen las del espejo.
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
          <span className="display mt-1 block text-lead">¿Te pondrías esto?</span>
        </span>
        <span aria-hidden className="shrink-0 text-small text-ink-faint">
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
          <span className="mt-1 block text-small leading-[1.5] text-ink-soft">
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
          <span className="mt-1 block text-small leading-[1.5] text-ink-soft">
            Quedaron fotos por analizar. Cuantas más vea, mejor te entiendo.
          </span>
        </Link>
      ) : null}

      {/* --- Tu armario --------------------------------------------------- */}
      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="display text-lead">Tu armario · {prendas}</h2>
          <Link href="/armario" className="text-micro whitespace-nowrap text-ink-faint">
            ver todo
          </Link>
        </div>

        {/*
          La tira sube de 56×70 a 94×125.

          A cincuenta y seis píxeles de ancho una prenda no es una prenda: es
          una muestra de color. Esta tira existe para reconocer lo que tienes de
          un vistazo, y para eso hay que verle la forma.
        */}
        <ul className="no-scrollbar bleed-row flex gap-[9px] overflow-x-auto pb-1">
          {stripItems.map((item) => {
            const nombre = describeGarment(item)
            return (
              <li key={item.id} className="shrink-0">
                <Link href={`/armario/${item.id}`} className="block">
                  <PhotoSlot
                    src={item.image_path ? (signed.get(item.image_path) ?? null) : null}
                    label={nombre}
                    showLabel={false}
                    className="press h-[125px] w-[94px] rounded-[14px]"
                  />
                </Link>
              </li>
            )
          })}

          <li className="shrink-0">
            <Link
              href="/armario/nueva"
              aria-label="Añadir una prenda"
              className="press flex h-[125px] w-[94px] items-center justify-center rounded-[14px] border border-dashed border-line text-lead text-ink-faint"
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
          Un look que te ha montado alguien y no has visto.

          Va el primero de todo porque es lo único de esta pantalla que ha hecho
          una persona a mano, pensando en ti. Si se queda debajo del diario,
          quien se molestó en montarlo creerá que no le han hecho caso.
        */}
        {summary.unseenLooks > 0 ? (
          <Link
            href="/vestir"
            className="flex items-center justify-between gap-4 border-t border-line py-3.5"
          >
            <span className="min-w-0">
              <span className="display block text-lead">Te han vestido</span>
              <span className="mt-0.5 block truncate text-small text-ink-soft">
                {summary.unseenLooks === 1
                  ? 'Alguien te ha montado un look con tu ropa'
                  : `${summary.unseenLooks} looks montados con tu ropa`}
              </span>
            </span>
            <span className="mono shrink-0 rounded-full bg-clay px-2 py-[3px] text-micro text-[#f7f4ee]">
              nuevo
            </span>
          </Link>
        ) : null}

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
              <span className="display block text-lead">Tu votación</span>
              <span className="mt-0.5 block truncate text-small text-ink-soft">
                {openPoll.votes === 0
                  ? 'Todavía no ha votado nadie'
                  : openPoll.votes === 1
                    ? '1 voto'
                    : `${openPoll.votes} votos`}
              </span>
            </span>
            <Countdown closesAt={openPoll.closesAt} onZeroRefresh={false} className="shrink-0 text-small" />
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

