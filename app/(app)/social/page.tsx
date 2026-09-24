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
import { PhotoSlot } from '@/components/ui'
import { Tile } from '@/components/social/Tile'
import { packTiles } from '@/lib/social/mosaic'
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

  /*
   * Las piezas del mosaico.
   *
   * El peso no es decoración: dice si esa pieza tiene algo que contarte HOY.
   * Préstamos sin contestar ocupa media pantalla; préstamos al día, un tercio.
   * Lo que no está pasando encoge y deja sitio a lo que sí.
   */
  const compartenHoy =
    summary.sharedNames.length === 0
      ? 'Hoy todavía no ha enseñado nadie'
      : summary.sharedNames.length === 1
        ? `${summary.sharedNames[0]} ha enseñado el suyo`
        : `${summary.sharedNames.slice(0, 2).join(' y ')}${
            summary.sharedNames.length > 2 ? ` y ${summary.sharedNames.length - 2} más` : ''
          }`

  const tiles = packTiles([
    /*
     * La única pieza negra de la pantalla, y a ancho completo.
     *
     * No es la más urgente —si hubiera votaciones esperando, esas van arriba en
     * su propia tira— pero sí es lo que esta pantalla existe para que hagas.
     */
    [
      {
        key: 'votacion',
        props: {
          href: '/votacion/nueva',
          eyebrow: 'En minutos',
          title: '¿Cuál me pongo?',
          note: 'Subes dos o tres y que lo decidan ellas',
          tone: 'ink' as const,
        },
      },
      'hero' as const,
    ],

    // Nombres y no un número: «Marta y Lucía» invita, «2 publicaciones» informa.
    [
      {
        key: 'feed',
        props: {
          href: '/social/feed',
          eyebrow: 'Hoy',
          title: 'Lo que se pone tu gente',
          note: compartenHoy,
          tone: 'raised' as const,
        },
      },
      summary.sharedNames.length > 0 ? ('half' as const) : ('small' as const),
    ],

    ...(summary.unseenLooks > 0
      ? ([
          [
            {
              key: 'vestir',
              props: {
                href: '/vestir',
                eyebrow: 'Sin ver',
                title: 'Te han vestido',
                note:
                  summary.unseenLooks === 1
                    ? 'Alguien te ha montado un look con tu ropa'
                    : `${summary.unseenLooks} looks con tu ropa`,
                badge: summary.unseenLooks,
                tone: 'raised' as const,
              },
            },
            'half' as const,
          ],
        ] as const)
      : []),

    [
      {
        key: 'prestamos',
        props: {
          href: '/prestamos',
          title: 'Préstamos',
          note: summary.pendingLoans > 0 ? 'Esperando tu respuesta' : 'Quién tiene qué',
          badge: summary.pendingLoans > 0 ? summary.pendingLoans : undefined,
        },
      },
      summary.pendingLoans > 0 ? ('half' as const) : ('small' as const),
    ],

    [
      {
        key: 'retos',
        props: {
          href: '/social/retos',
          eyebrow: 'Esta semana',
          title: 'El reto',
          note: 'Lo que se lleva estos siete días',
        },
      },
      'half' as const,
    ],

    [
      { key: 'duelo', props: { href: '/social/duelo', title: 'Duelo', note: 'A ciegas' } },
      'small' as const,
    ],
    [
      { key: 'eventos', props: { href: '/eventos', title: 'Eventos', note: 'Sin ir iguales' } },
      'small' as const,
    ],
    [
      { key: 'resumen', props: { href: '/social/resumen', title: 'Tu mes', note: 'En números' } },
      'small' as const,
    ],

    [
      {
        key: 'circulo',
        props: {
          href: '/circulo',
          title: 'Mis amigas',
          note:
            summary.circleCount === 0
              ? 'Todavía no hay nadie: invita a alguien'
              : `${summary.circleCount} ${summary.circleCount === 1 ? 'persona' : 'personas'} y lo que ve cada una`,
        },
      },
      summary.circleCount === 0 ? ('hero' as const) : ('half' as const),
    ],
  ])

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      {/* --- Cabecera ------------------------------------------------------- */}
      <header className="pt-5 pb-5">
        <p className="eyebrow mb-2.5">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long' })} · tu círculo
        </p>
        <h1 className="display text-display leading-[1.02]">
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

      {/* --- El mosaico ------------------------------------------------------
          Ocho filas idénticas se leían como una pantalla de ajustes: todas
          pesaban lo mismo y ninguna podía enseñar lo que tenía dentro.

          Aquí cada pieza declara lo que pide —grande, media o pequeña— según
          tenga algo que contar hoy, y `packTiles` reparte los anchos para que
          ninguna fila quede a medias. Ver `lib/social/mosaic.ts`. */}
      <ul className="mt-8 grid grid-cols-6 gap-2.5">
        {tiles.map(({ item, span }) => (
          <Tile key={item.key} span={span} {...item.props} />
        ))}
      </ul>
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
