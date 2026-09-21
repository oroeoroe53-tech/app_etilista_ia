import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { loadPollByToken } from '@/lib/polls/queries'
import { requestOrigin } from '@/lib/utils/origin'
import { track } from '@/lib/observability/funnel'
import { closePoll } from '@/app/(app)/votacion/actions'
import { Countdown } from '@/components/polls/Countdown'
import { VoteBoard } from '@/components/polls/VoteBoard'
import { ShareBar } from '@/components/polls/ShareBar'

/*
 * Nunca estática y nunca cacheada: el resultado cambia cada pocos segundos y
 * enseñar una versión guardada de una votación es enseñar una mentira con
 * cuenta atrás.
 */
export const dynamic = 'force-dynamic'

/**
 * Una votación, vista desde el enlace.
 *
 * Es la única pantalla de la aplicación que verá gente que no la tiene. Llega
 * por un mensaje de una amiga, desde WhatsApp, probablemente sin haber oído el
 * nombre del producto. Así que:
 *
 *  · **No lleva barra de navegación.** No está aquí para explorar nada.
 *  · **Se ve entera sin cuenta.** Las fotos, la pregunta y el tiempo que queda.
 *    Lo único que pide cuenta es votar.
 *  · **No dice de qué aplicación es hasta el final.** Primero la conversación
 *    que traía, después nosotros.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const poll = await loadPollByToken(token, null)

  // Sin fotos ni nombres en los metadatos: esta URL se pega en chats que hacen
  // vista previa automática, y la vista previa la ve gente que no ha abierto el
  // enlace. Lo que se enseña ahí es genérico a propósito.
  return {
    title: poll ? '¿Cuál me pongo? · Estilista' : 'Esta votación ya no está · Estilista',
    description: 'Una votación rápida para decidir qué ponerse.',
    robots: { index: false, follow: false },
  }
}

export default async function PollPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const user = await getCurrentUser()
  const poll = await loadPollByToken(token, user?.id ?? null)

  if (!poll) notFound()

  track('poll_opened', user?.id ?? null)

  const url = `${await requestOrigin()}/v/${poll.token}`
  const minutesLeft = Math.max(
    0,
    Math.round((new Date(poll.closesAt).getTime() - Date.now()) / 60_000),
  )

  return (
    <main
      className="mx-auto w-full max-w-[30rem] pt-safe pb-16"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="pt-7 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-2.5">
              {poll.isOwner ? 'Tu votación' : `${poll.ownerName} pregunta`}
            </p>
            <h1 className="display text-[30px] leading-[1.08]">
              ¿Cuál
              <span className="display-italic"> me pongo?</span>
            </h1>
          </div>

          {/* La cuenta atrás, arriba a la derecha, como la hora en un billete. */}
          <div className="shrink-0 pt-1 text-right">
            <Countdown closesAt={poll.closesAt} className="text-[15px]" />
            <p className="mono mt-1 text-ink-faint">
              {poll.closed ? 'se acabó' : 'para votar'}
            </p>
          </div>
        </div>

        {poll.question ? (
          <p className="mt-3.5 text-[12.5px] leading-[1.5] text-ink-soft">{poll.question}</p>
        ) : null}

        {poll.totalVotes > 0 ? (
          <p className="mono mt-3 text-ink-faint">
            {poll.totalVotes === 1 ? '1 voto' : `${poll.totalVotes} votos`}
          </p>
        ) : null}
      </header>

      <VoteBoard
        poll={poll}
        signedIn={Boolean(user)}
        loginHref={`/register?next=${encodeURIComponent(`/v/${poll.token}`)}`}
      />

      {/* --- Lo que solo ve quien preguntó ---------------------------------- */}
      {poll.isOwner ? (
        <section className="mt-9">
          {!poll.closed ? (
            <>
              <ShareBar url={url} minutesLeft={minutesLeft} />

              <form action={closePoll} className="mt-4">
                <input type="hidden" name="token" value={poll.token} />
                <button
                  type="submit"
                  className="w-full py-2 text-center text-[11.5px] text-ink-soft underline underline-offset-4"
                >
                  Ya está, cerrar ahora
                </button>
              </form>
            </>
          ) : (
            <p className="text-center text-[11.5px] leading-[1.6] text-ink-soft">
              Votación cerrada.{' '}
              {poll.totalVotes === 0
                ? 'No llegó ningún voto a tiempo.'
                : 'Las fotos se borran solas dentro de unas horas.'}
            </p>
          )}
        </section>
      ) : null}

      {/* --- Quiénes somos, al final y en voz baja -------------------------- */}
      <footer className="mt-12 border-t border-line pt-6 text-center">
        <p className="text-[11px] leading-[1.6] text-ink-faint">
          Esto es <span className="display text-ink">Estilista</span>: te propone
          qué ponerte con la ropa que ya tienes.
        </p>
        <p className="mt-2.5 text-[11px]">
          <Link href="/demo" className="text-ink-soft underline underline-offset-4">
            Ver cómo funciona
          </Link>
        </p>
      </footer>
    </main>
  )
}
