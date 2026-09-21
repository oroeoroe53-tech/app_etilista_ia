'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { castVote, type VoteState } from '@/app/(app)/votacion/actions'
import { Button, Notice, TextInput } from '@/components/ui'
import type { PollView } from '@/lib/polls/types'
import { cn } from '@/lib/utils/cn'

/**
 * Las fotos, el voto y el resultado.
 *
 * Una sola pantalla para tres situaciones, porque son la misma conversación en
 * tres momentos y partirla en tres pantallas la rompería:
 *
 *  · **Quien todavía no ha votado** ve las fotos grandes y nada más. Sin
 *    porcentajes: enseñar lo que van ganando las demás antes de que opine es
 *    decirle lo que tiene que opinar.
 *  · **Quien ya ha votado** ve los resultados y quién ha dicho qué.
 *  · **Quien preguntó** ve los resultados desde el principio; para eso preguntó.
 *
 * Quien no tiene cuenta ve exactamente lo mismo que quien no ha votado, y el
 * registro solo aparece cuando toca una foto. Pedirlo antes de haber visto nada
 * es pedirlo a cambio de nada.
 */
export function VoteBoard({
  poll,
  signedIn,
  loginHref,
}: {
  poll: PollView
  signedIn: boolean
  loginHref: string
}) {
  const [state, formAction] = useActionState<VoteState, FormData>(castVote, {})

  const [selected, setSelected] = useState<string | null>(poll.myVote?.optionId ?? null)
  // Quien ya votó ve el resultado; «cambiar» le devuelve a elegir.
  const [changing, setChanging] = useState(false)

  const voted = Boolean(poll.myVote)
  const showResults = (poll.isOwner || voted || poll.closed) && !changing
  const canVote = signedIn && !poll.isOwner && !poll.closed

  return (
    <div>
      <ul className={cn('grid gap-2.5', showResults ? 'grid-cols-1' : 'grid-cols-2')}>
        {poll.options.map((option) => {
          const chosen = selected === option.id
          const mine = poll.myVote?.optionId === option.id
          const leading = poll.leadingOptionId === option.id

          return (
            <li key={option.id}>
              <button
                type="button"
                aria-pressed={chosen}
                disabled={showResults}
                onClick={() => {
                  if (!signedIn) return
                  setSelected(option.id)
                }}
                className={cn(
                  'group relative block w-full overflow-hidden rounded-[var(--radius-card)] text-left',
                  showResults ? 'flex gap-3.5 bg-raised p-3 shadow-card-soft' : 'aspect-[3/4]',
                  chosen && !showResults && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.imageUrl ?? ''}
                  alt={option.label ?? `Opción ${option.position}`}
                  className={cn(
                    'bg-sunken object-cover',
                    showResults
                      ? 'h-[86px] w-[68px] shrink-0 rounded-2xl'
                      : 'h-full w-full',
                  )}
                />

                {showResults ? (
                  <span className="min-w-0 flex-1 self-center">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="display text-[19px]">
                        {option.label ?? `Opción ${option.position}`}
                      </span>
                      <span className="mono tabular-nums text-ink">{option.share}%</span>
                    </span>

                    {/* La barra se pinta con la misma tinta que todo lo demás;
                        la que va ganando es la única que se rellena en sólido. */}
                    <span className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-sunken">
                      <span
                        className={cn('block h-full rounded-full', leading ? 'bg-accent' : 'bg-clay')}
                        style={{ width: `${option.share}%` }}
                      />
                    </span>

                    <span className="mt-1.5 block truncate text-[10.5px] text-ink-soft">
                      {option.votes === 0
                        ? 'sin votos'
                        : option.voters.join(', ')}
                      {mine ? ' · tu voto' : ''}
                    </span>
                  </span>
                ) : (
                  <span className="absolute inset-x-0 bottom-0 flex items-end justify-between p-2.5">
                    <span className="mono rounded-full bg-[rgba(21,20,15,.55)] px-2 py-1 text-[9px] text-[#f7f4ee]">
                      {option.label ?? String(option.position)}
                    </span>
                    {chosen ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[12px] text-accent-ink">
                        ✓
                      </span>
                    ) : null}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {/* --- Lo que ha dicho la gente --------------------------------------- */}
      {showResults && poll.comments.length > 0 ? (
        <ul className="mt-6">
          {poll.comments.map((comment, index) => (
            <li key={index} className="border-t border-line py-3 last:border-b">
              <p className="text-[12px] leading-[1.5]">{comment.text}</p>
              <p className="mono mt-1 text-ink-faint">
                {comment.name.toLowerCase()} · opción {comment.optionPosition}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {/* --- Votar ----------------------------------------------------------- */}
      {!signedIn && !poll.closed ? (
        <div className="mt-7">
          <Link href={loginHref} className="block">
            <Button size="lg" fullWidth type="button">
              Crear cuenta y votar
            </Button>
          </Link>
          <p className="mt-3 text-center text-[10.5px] leading-[1.6] text-ink-faint">
            Hace falta cuenta para que cada persona vote una vez. Al terminar
            vuelves aquí.
          </p>
        </div>
      ) : null}

      {canVote && !showResults ? (
        <form action={formAction} className="mt-6">
          <input type="hidden" name="token" value={poll.token} />
          <input type="hidden" name="optionId" value={selected ?? ''} />

          <TextInput
            name="comment"
            maxLength={140}
            placeholder="Añade algo (opcional): «con las botas»"
            autoComplete="off"
          />

          {state.error ? (
            <div className="mt-4">
              <Notice tone="error">{state.error}</Notice>
            </div>
          ) : null}

          <div className="mt-4">
            <SubmitVote disabled={!selected} changing={voted} />
          </div>
        </form>
      ) : null}

      {/* Cambiar de opinión mientras siga abierta. Es lo que hace que alguien
          se atreva a votar rápido. */}
      {canVote && showResults && voted ? (
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="mt-6 w-full py-2 text-center text-[11.5px] text-ink-soft underline underline-offset-4"
        >
          Cambiar mi voto
        </button>
      ) : null}
    </div>
  )
}

function SubmitVote({ disabled, changing }: { disabled: boolean; changing: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={disabled || pending}>
      {pending ? 'Enviando…' : changing ? 'Cambiar mi voto' : 'Votar'}
    </Button>
  )
}
