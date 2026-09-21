'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { castVote, type VoteState } from '@/app/(app)/votacion/actions'
import { Button, Notice, PhotoSlot, TextInput } from '@/components/ui'
import type { PollOptionView, PollView } from '@/lib/polls/types'
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
                <OptionArt
                  option={option}
                  className={cn(
                    showResults ? 'h-[86px] w-[68px] shrink-0 rounded-2xl' : 'h-full w-full',
                  )}
                />

                {showResults ? (
                  <span className="min-w-0 flex-1 self-center">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="display truncate text-[19px]">
                        {option.name ?? option.label ?? `Opción ${option.position}`}
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
                  <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
                    <span className="min-w-0">
                      <span className="mono inline-block rounded-full bg-[rgba(21,20,15,.55)] px-2 py-1 text-[9px] text-[#f7f4ee]">
                        {option.name ?? option.label ?? String(option.position)}
                      </span>
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

      {/*
        El porqué de cada look, para quien todavía no ha votado.

        Lo escribe el motor con sus propios criterios, no un modelo de lenguaje:
        «hace 19°», «no lo llevas desde hace seis semanas». Es lo que convierte
        tres rectángulos de ropa en tres propuestas que se pueden comparar.
      */}
      {!showResults && poll.options.some((o) => o.why) ? (
        <ul className="mt-4 space-y-1.5">
          {poll.options.map((option) =>
            option.why ? (
              <li key={option.id} className="flex gap-2 text-[11px] leading-[1.45] text-ink-soft">
                <span className="mono shrink-0 text-ink-faint">{option.position}</span>
                <span className="min-w-0">{option.why}</span>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}

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


/**
 * La imagen de una opción.
 *
 * Una foto se enseña tal cual. Un look no tiene foto —nadie se lo ha puesto
 * todavía— así que se pinta con las prendas que lo componen, la primera grande
 * y las demás apiladas al lado. Es la misma composición que usa la portada para
 * el look del día, y se lee de un vistazo: arriba, abajo, y lo que sea que
 * venga después.
 */
function OptionArt({ option, className }: { option: PollOptionView; className?: string }) {
  if (option.kind === 'photo') {
    return (
      <PhotoSlot
        src={option.imageUrl}
        label={option.label ?? `Opción ${option.position}`}
        showLabel={false}
        className={cn('bg-sunken', className)}
      />
    )
  }

  const [first, ...rest] = option.garments

  return (
    <span className={cn('flex gap-1 bg-sunken p-1', className)}>
      <PhotoSlot
        src={first?.imageUrl ?? null}
        label={first?.label ?? ''}
        showLabel={false}
        className="min-w-0 flex-[1.3] rounded-xl"
      />
      {rest.length > 0 ? (
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {rest.slice(0, 3).map((garment, index) => (
            <PhotoSlot
              key={index}
              src={garment.imageUrl}
              label={garment.label}
              showLabel={false}
              className="min-h-0 flex-1 rounded-xl"
            />
          ))}
        </span>
      ) : null}
    </span>
  )
}
