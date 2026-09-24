import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listMyEvents } from '@/lib/events/queries'
import { formatEventDate } from '@/lib/events/format'
import { BackLink, Button, EmptyState } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Eventos · Selyqo' }

/**
 * Los eventos a los que vas.
 *
 * Ordenados por fecha, el más cercano arriba, porque es el único orden que
 * tiene sentido cuando lo que se mira es «¿qué me pongo el sábado?».
 *
 * Lo que falta por hacer se marca en cada fila: quien no ha dicho de qué va es
 * exactamente quien puede acabar repitiendo el vestido de otra.
 */
export default async function EventsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const events = await listMyEvents(user.id)

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/perfil">perfil</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Con gente</p>
        <h1 className="display text-display leading-[1.06]">
          Eventos
          <span className="display-italic block">y quién va de qué</span>
        </h1>
      </header>

      {events.length === 0 ? (
        <EmptyState
          title="Nada en el horizonte"
          body="Una boda, un festival, una cena. Creas el evento, mandas el enlace y cada una dice qué se pone."
          action={
            <Link href="/eventos/nuevo" className="block">
              <Button fullWidth size="lg">
                Crear un evento
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-2.5">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/eventos/${event.id}`}
                  className="press sheen sheen-paper lift-paper flex items-center justify-between gap-4 rounded-[22px] border border-line p-3.5"
                >
                  <span className="min-w-0">
                    <span className="display block truncate text-lead">{event.title}</span>
                    <span className="mono mt-1 block truncate text-ink-faint">
                      {formatEventDate(event.heldOn)}
                      {event.place ? ` · ${event.place}` : ''} · {event.guests}{' '}
                      {event.guests === 1 ? 'persona' : 'personas'}
                    </span>
                  </span>

                  {event.pendingOutfit ? (
                    <span className="mono shrink-0 rounded-full bg-clay px-2 py-[3px] text-micro text-[#f7f4ee]">
                      falta lo tuyo
                    </span>
                  ) : (
                    <span aria-hidden className="shrink-0 text-small text-ink-faint">
                      →
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-9">
            <Link href="/eventos/nuevo" className="block">
              <Button fullWidth size="lg">
                Crear un evento
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
