'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { recordSwipe, finishSwipeSession } from '@/app/(app)/outfits/swipe/actions'
import { Button, Notice } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

export interface SwipeCard {
  key: string
  itemIds: string[]
  items: Array<{ id: string; name: string; imageUrl: string | null }>
}

type Reaction = 'dislike' | 'like' | 'love' | 'skip'

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'color', label: 'El color' },
  { value: 'fit', label: 'Cómo sienta' },
  { value: 'item', label: 'Una prenda en concreto' },
  { value: 'too_formal', label: 'Demasiado arreglado' },
  { value: 'too_casual', label: 'Demasiado informal' },
  { value: 'not_my_style', label: 'No es mi estilo' },
  { value: 'other', label: 'Otra cosa' },
]

/** A partir de cuántos píxeles arrastrados cuenta como deslizamiento. */
const SWIPE_THRESHOLD = 90

/**
 * La baraja de looks.
 *
 * El objetivo no es entretener: cada respuesta es una señal que alimenta el
 * perfil (PLAN.md §17). Por eso el "no sé" existe y vale exactamente cero — es
 * mejor que alguien pueda decir "ni fu ni fa" a que responda al azar por no
 * tener una salida.
 *
 * El motivo del rechazo se pregunta pero nunca se obliga: se puede saltar, y
 * saltarlo sigue registrando el rechazo.
 */
export function SwipeDeck({ cards: initial }: { cards: SwipeCard[] }) {
  const router = useRouter()

  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const [leaving, setLeaving] = useState<Reaction | null>(null)
  const [askingReason, setAskingReason] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState({ rated: 0 })

  const startRef = useRef({ x: 0, y: 0 })
  const pendingRef = useRef<SwipeCard | null>(null)

  const card = initial[index]
  const next = initial[index + 1]
  const finished = index >= initial.length

  // Al terminar la baraja se recalcula el perfil una vez, para que el cambio se
  // note ya en la pantalla de Estilo.
  useEffect(() => {
    if (!finished) return
    finishSwipeSession().then(() => router.refresh())
  }, [finished, router])

  const commit = useCallback(
    async (reaction: Reaction, reason: string | null, target: SwipeCard) => {
      const result = await recordSwipe(target.itemIds, reaction, reason)
      if (!result.ok) {
        setError(result.error ?? 'No hemos podido guardar tu respuesta.')
        return
      }
      setError(null)
      setCounts((c) => ({ rated: c.rated + 1 }))
    },
    [],
  )

  const advance = useCallback(() => {
    setIndex((i) => i + 1)
    setDrag({ x: 0, y: 0, active: false })
    setLeaving(null)
  }, [])

  const react = useCallback(
    (reaction: Reaction) => {
      if (!card || leaving) return

      setLeaving(reaction)

      if (reaction === 'dislike') {
        // Se registra ya: el motivo es opcional y no debe retener la señal.
        pendingRef.current = card
        void commit('dislike', null, card)
        setTimeout(() => {
          setAskingReason(true)
        }, 220)
        return
      }

      void commit(reaction, null, card)
      setTimeout(advance, 220)
    },
    [card, leaving, commit, advance],
  )

  function onReason(reason: string | null) {
    const target = pendingRef.current
    setAskingReason(false)
    pendingRef.current = null

    if (target && reason) {
      // Ya hay una valoración guardada para este look: se completa con el motivo.
      void recordSwipe(target.itemIds, 'dislike', reason)
    }
    advance()
  }

  // --- Gestos -------------------------------------------------------------

  function onPointerDown(event: React.PointerEvent) {
    if (leaving || askingReason) return
    startRef.current = { x: event.clientX, y: event.clientY }
    setDrag({ x: 0, y: 0, active: true })
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag.active) return
    setDrag({
      x: event.clientX - startRef.current.x,
      y: event.clientY - startRef.current.y,
      active: true,
    })
  }

  function onPointerUp() {
    if (!drag.active) return

    if (drag.x > SWIPE_THRESHOLD) react('like')
    else if (drag.x < -SWIPE_THRESHOLD) react('dislike')
    else if (drag.y < -SWIPE_THRESHOLD) react('love')
    else setDrag({ x: 0, y: 0, active: false })
  }

  // --- Teclado ------------------------------------------------------------

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (askingReason || finished) return
      if (event.key === 'ArrowLeft') react('dislike')
      else if (event.key === 'ArrowRight') react('like')
      else if (event.key === 'ArrowUp') react('love')
      else if (event.key === 'ArrowDown') react('skip')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [react, askingReason, finished])

  // --- Render -------------------------------------------------------------

  if (finished) {
    return (
      <div className="py-16 text-center">
        <h2 className="display mb-3 text-3xl">Ya está</h2>
        <p className="mx-auto mb-8 max-w-xs text-sm leading-relaxed text-ink-soft">
          {counts.rated === 0
            ? 'No has valorado ninguno. Cuando quieras, aquí sigo.'
            : `Has valorado ${counts.rated} ${counts.rated === 1 ? 'look' : 'looks'}. Con eso afino un poco más.`}
        </p>
        <div className="space-y-3">
          <Button fullWidth size="lg" onClick={() => router.refresh()}>
            Enséñame más
          </Button>
          <Button variant="secondary" fullWidth onClick={() => router.push('/estilo')}>
            Ver cómo me ves
          </Button>
        </div>
      </div>
    )
  }

  if (!card) return null

  const rotation = drag.x / 18
  const opacity = leaving ? 0 : 1
  const transform = leaving
    ? leaving === 'like'
      ? 'translateX(140%) rotate(18deg)'
      : leaving === 'dislike'
        ? 'translateX(-140%) rotate(-18deg)'
        : leaving === 'love'
          ? 'translateY(-140%)'
          : 'scale(0.9)'
    : `translate(${drag.x}px, ${drag.y}px) rotate(${rotation}deg)`

  return (
    <div className="select-none">
      <div className="relative mb-6 h-[26rem]">
        {next ? <CardFace card={next} behind /> : null}

        <div
          role="group"
          aria-label="Look propuesto. Usa las flechas del teclado o los botones."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            transform,
            opacity,
            transition: drag.active ? 'none' : 'transform 220ms ease-out, opacity 220ms ease-out',
            touchAction: 'none',
          }}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
        >
          <CardFace card={card} />

          <Stamp show={drag.x > 40} tone="like" label="Me gusta" />
          <Stamp show={drag.x < -40} tone="dislike" label="No" />
          <Stamp show={drag.y < -40 && Math.abs(drag.x) < 60} tone="love" label="Me encanta" />
        </div>
      </div>

      {error ? (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-3">
        <ActionButton label="No me gusta" onClick={() => react('dislike')}>
          <IconCross />
        </ActionButton>
        <ActionButton label="No sé" small onClick={() => react('skip')}>
          <IconSkip />
        </ActionButton>
        <ActionButton label="Me encanta" tone="love" onClick={() => react('love')}>
          <IconFlame />
        </ActionButton>
        <ActionButton label="Me gusta" tone="like" onClick={() => react('like')}>
          <IconHeart />
        </ActionButton>
      </div>

      <p className="mt-6 text-center text-xs text-ink-faint">
        {index + 1} de {initial.length} · desliza o usa las flechas
      </p>

      {askingReason ? <ReasonSheet onPick={onReason} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

function CardFace({ card, behind }: { card: SwipeCard; behind?: boolean }) {
  const items = card.items.slice(0, 4)

  return (
    <div
      className={cn(
        'h-full w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-raised',
        behind && 'absolute inset-0 scale-95 opacity-50',
      )}
      aria-hidden={behind}
    >
      <div
        className={cn(
          'grid h-full w-full gap-0.5',
          items.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2',
        )}
      >
        {items.map((item) => (
          <div key={item.id} className="relative overflow-hidden bg-sunken">
            {item.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.imageUrl}
                alt={item.name}
                draggable={false}
                className="garment-photo h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] leading-tight text-ink-faint">
                {item.name}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Stamp({
  show,
  tone,
  label,
}: {
  show: boolean
  tone: 'like' | 'dislike' | 'love'
  label: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-6 rounded-full border-2 px-4 py-1.5 text-sm font-medium tracking-wide uppercase transition-opacity',
        show ? 'opacity-100' : 'opacity-0',
        tone === 'like' && 'right-6 rotate-12 border-ink text-ink',
        tone === 'dislike' && 'left-6 -rotate-12 border-danger text-danger',
        tone === 'love' && 'left-1/2 -translate-x-1/2 border-love text-love',
      )}
    >
      {label}
    </span>
  )
}

function ActionButton({
  label,
  onClick,
  children,
  tone,
  small,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  tone?: 'like' | 'love'
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex items-center justify-center rounded-full border transition-transform active:scale-90',
        small ? 'h-11 w-11' : 'h-14 w-14',
        tone === 'like' && 'border-ink bg-accent text-accent-ink',
        tone === 'love' && 'border-love text-love',
        !tone && 'border-line text-ink-soft',
      )}
    >
      {children}
    </button>
  )
}

/**
 * "¿Por qué no?"
 *
 * El motivo es lo que permite castigar solo la dimensión correcta: decir que no
 * gusta el color no debe ensuciar lo que sabemos del estilo (PLAN.md §17 y §18).
 * Por eso se pregunta. Y por eso se puede saltar sin coste: el rechazo ya está
 * registrado antes de abrir esto.
 */
function ReasonSheet({ onPick }: { onPick: (reason: string | null) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-[var(--radius-card)] border-t border-line bg-surface px-5 pt-6 pb-10">
        <p className="eyebrow mb-4">¿Qué es lo que no te convence?</p>

        <ul className="mb-5 space-y-2">
          {REASONS.map((reason) => (
            <li key={reason.value}>
              <button
                type="button"
                onClick={() => onPick(reason.value)}
                className="w-full rounded-2xl border border-line bg-raised px-4 py-3 text-left text-sm active:bg-sunken"
              >
                {reason.label}
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => onPick(null)}
          className="w-full text-center text-sm text-ink-soft underline underline-offset-4"
        >
          Prefiero no decirlo
        </button>
      </div>
    </div>
  )
}

/* --- Iconos --------------------------------------------------------------- */

const strokeProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function IconCross() {
  return (
    <svg {...strokeProps}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function IconHeart() {
  return (
    <svg {...strokeProps}>
      <path d="M12 20s-7-4.6-7-9.3A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.7C19 15.4 12 20 12 20z" />
    </svg>
  )
}

function IconFlame() {
  return (
    <svg {...strokeProps}>
      <path d="M12 3s5 4.2 5 8.6A5 5 0 0 1 7 12c0-1.7 1-3.2 1-3.2s.6 1.4 1.6 1.7C9.3 7.8 12 3 12 3z" />
    </svg>
  )
}

function IconSkip() {
  return (
    <svg {...strokeProps} width={18} height={18}>
      <path d="M5 12h14" />
    </svg>
  )
}
