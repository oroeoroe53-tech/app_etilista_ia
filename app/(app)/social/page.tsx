import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, requireUserId } from '@/lib/supabase/server'
import { getSocialSummary } from '@/lib/social/summary'
import { currentStreak, weekStates, streakWindowStart } from '@/lib/social/streak'
import { findNeglected, neglectMessage, neglectCutoffs } from '@/lib/wardrobe/neglected'
import { describeGarment } from '@/lib/wardrobe/labels'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { Countdown } from '@/components/polls/Countdown'
import { HeaderLight, PhotoSlot, QuietRow } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Social · Estilista' }

/**
 * La portada social.
 *
 * Reúne lo que hasta ahora estaba repartido entre Perfil y enlaces sueltos, y
 * lo ordena por una sola regla: **primero lo que espera algo de ti**.
 *
 *  1. Votaciones de tus amigas con la cuenta atrás corriendo. Son minutos.
 *  2. Peticiones de préstamo y looks que te han montado. Son horas.
 *  3. Tu círculo, los eventos, el rescate del día. Son cuando quieras.
 *
 * La racha sale de `wear_history` y no de una tabla nueva: el dato ya existía
 * (`lib/social/streak.ts` explica por qué eso importa).
 */
export default async function SocialPage() {
  // El proxy ya validó la sesión en esta misma petición.
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    redirect('/login')
  }

  const supabase = await createClient()
  const cutoffs = neglectCutoffs()
  const since = streakWindowStart()

  /*
   * Dos consultas, no ocho.
   *
   * Todo lo social —votaciones pendientes, préstamos, looks sin ver, círculo,
   * quién ha publicado hoy— lo contesta `social_summary()` de una vez dentro de
   * Postgres. Lo demás va en la misma tanda porque no depende de ello.
   */
  const [summary, { data: worn }, { data: forNeglect }] = await Promise.all([
    getSocialSummary(supabase, userId),
    supabase
      .from('wear_history')
      .select('worn_on')
      .gte('worn_on', since)
      .order('worn_on', { ascending: false }),
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

  const dates = ((worn ?? []) as { worn_on: string }[]).map((w) => w.worn_on)
  const streak = currentStreak(dates)
  const week = weekStates(dates)

  const olvidada = findNeglected((forNeglect ?? []) as never[], new Date(), 1)[0] ?? null
  const signed = olvidada?.image_path
    ? await signMany(supabase, BUCKETS.clothing, [olvidada.image_path], userId)
    : null

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      {/* --- Cabecera ------------------------------------------------------- */}
      <header className="relative pt-5 pb-5">
        <HeaderLight />
        <p className="relative mb-2.5 eyebrow">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long' })} · tu círculo
        </p>
        <h1 className="display relative text-display leading-[1.02]">
          {headline(summary.pendingVotes.length, summary.circleCount)}
        </h1>
      </header>

      {/* --- La racha -------------------------------------------------------- */}
      <section className="flex items-center gap-4 rounded-[var(--radius-card)] bg-raised p-4 shadow-card">
        <div className="text-center">
          <p className="display text-display-l leading-[0.9] tabular-nums">{streak}</p>
          <p className="eyebrow mt-1.5">{streak === 1 ? 'día' : 'días'}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-small leading-[1.45]">
            {streak === 0
              ? 'Ponte hoy lo que te proponga y empieza la cuenta.'
              : 'Poniéndote lo que te propongo.'}{' '}
            <span className="text-ink-soft">
              {streak === 0 ? 'Se cuenta al marcar un look como puesto.' : `Sigue hoy y van ${streak + 1}.`}
            </span>
          </p>
          <div className="mt-2.5 flex gap-1.5">
            {week.map((state, index) => (
              <span
                key={index}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  state === 'done' && 'bg-accent',
                  state === 'today' && 'bg-clay',
                  state === 'missed' && 'bg-sunken',
                  state === 'future' && 'bg-sunken opacity-45',
                )}
              />
            ))}
          </div>
        </div>
      </section>

      {/* --- Lo que espera tu voto ------------------------------------------- */}
      {summary.pendingVotes.length > 0 ? (
        <section className="mt-8">
          <p className="eyebrow mb-3">Votaciones pendientes</p>
          <div className="bleed-row flex gap-3">
            {summary.pendingVotes.map((poll) => (
              <Link
                key={poll.token}
                href={`/v/${poll.token}`}
                className="w-[158px] shrink-0 rounded-[24px] bg-raised p-3 shadow-card-soft"
              >
                <div className="photo-slot h-[92px] rounded-[14px]" />
                <p className="display mt-2.5 text-lead leading-[1.15]">{poll.ownerName}</p>
                <p className="mt-1 truncate text-micro text-ink-soft">
                  {poll.question ?? `${poll.options} opciones`}
                </p>
                <Countdown closesAt={poll.closesAt} onZeroRefresh={false} className="mt-2 block" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- El rescate del día ---------------------------------------------- */}
      {olvidada ? (
        <section className="mt-8">
          <p className="eyebrow mb-3">Rescate del día</p>
          <Link
            href={`/armario/${olvidada.id}`}
            className="flex gap-3.5 rounded-[var(--radius-card)] border border-line p-3.5"
          >
            <PhotoSlot
              src={signed?.get(olvidada.image_path ?? '') ?? null}
              label={describeGarment(olvidada)}
              showLabel={false}
              className="h-[86px] w-[68px] shrink-0 rounded-2xl"
            />
            <span className="min-w-0 flex-1 self-center">
              <span className="display block truncate text-lead">
                {describeGarment(olvidada)}
              </span>
              <span className="mt-1 block text-small leading-[1.45] text-ink-soft">
                {neglectMessage(olvidada, describeGarment(olvidada))}
              </span>
            </span>
          </Link>
        </section>
      ) : null}

      {/* --- Lo demás, por orden de urgencia --------------------------------- */}
      <nav className="mt-8">
        <QuietRow href="/votacion/nueva" title="¿Cuál me pongo?">
          Que lo decidan ellas, en minutos
        </QuietRow>

        {/*
          Quién ha enseñado hoy lo que se ha puesto.

          Los nombres, y no un número, porque es lo que hace que apetezca
          entrar: «Marta y Lucía» es una invitación; «2 publicaciones» es una
          métrica.
        */}
        <QuietRow href="/social/feed" title="Lo que se pone tu gente">
          {summary.sharedNames.length === 0
            ? 'Hoy todavía no ha enseñado nadie nada'
            : summary.sharedNames.length === 1
              ? `${summary.sharedNames[0]} ha enseñado el suyo`
              : `${summary.sharedNames.slice(0, 2).join(' y ')}${summary.sharedNames.length > 2 ? ` y ${summary.sharedNames.length - 2} más` : ''} han enseñado el suyo`}
        </QuietRow>

        {summary.unseenLooks > 0 ? (
          <QuietRow href="/vestir" title="Te han vestido">
            {summary.unseenLooks === 1
              ? 'Alguien te ha montado un look con tu ropa'
              : `${summary.unseenLooks} looks montados con tu ropa`}
          </QuietRow>
        ) : null}

        <QuietRow href="/prestamos" title="Préstamos">
          {summary.pendingLoans > 0
            ? `${summary.pendingLoans} sin contestar`
            : 'Quién tiene qué'}
        </QuietRow>

        <QuietRow href="/social/retos" title="Reto de la semana">
          Lo que se lleva estos siete días
        </QuietRow>

        <QuietRow href="/social/duelo" title="Duelo de armarios">
          A ciegas, y que voten ellas
        </QuietRow>

        <QuietRow href="/eventos" title="Eventos">
          Que no vayáis iguales
        </QuietRow>

        <QuietRow href="/social/resumen" title="Tu mes">
          Los días que no has tenido que pensar
        </QuietRow>

        <QuietRow href="/circulo" title="Mis amigas">
          {summary.circleCount === 0
            ? 'Todavía no hay nadie: invita a alguien'
            : `${summary.circleCount} ${summary.circleCount === 1 ? 'persona' : 'personas'} y lo que ve cada una`}
        </QuietRow>
      </nav>
    </div>
  )
}

/**
 * El titular.
 *
 * Dice lo que hay, no una frase fija. Con tres votaciones esperando, eso es lo
 * que tiene que leer; con el círculo vacío, lo único que importa es que no hay
 * nadie todavía.
 */
function headline(pending: number, circle: number): React.ReactNode {
  if (pending > 0) {
    return (
      <>
        {pending === 1 ? 'Una amiga' : `${pending} amigas`}
        <span className="display-italic block">
          {pending === 1 ? 'espera tu voto' : 'esperan tu voto'}
        </span>
      </>
    )
  }

  if (circle === 0) {
    return (
      <>
        Vestirse
        <span className="display-italic block">es más fácil juntas</span>
      </>
    )
  }

  return (
    <>
      Hoy nadie
      <span className="display-italic block">te necesita</span>
    </>
  )
}
