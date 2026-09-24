'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { recordSwipe, finishSwipeSession } from '@/app/(app)/outfits/swipe/actions'
import { Button, Notice, PhotoSlot } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

export interface SwipeCard {
  key: string
  itemIds: string[]
  title: string
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
  const [counts, setCounts] = useState({ rated: 0, saved: 0 })

  const startRef = useRef({ x: 0, y: 0 })
  const pendingRef = useRef<SwipeCard | null>(null)

  const card = initial[index]

  /*
   * Las tres siguientes, de la más cercana a la más lejana. Más de tres no se
   * distinguen: el arco se satura y deja de decir cuánto queda.
   */
  const fan = initial.slice(index + 1, index + 4).reverse()
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
      // "Guardados" son los que te pondrías, no los que has contestado.
      setCounts((c) => ({
        rated: c.rated + 1,
        saved: c.saved + (reaction === 'like' || reaction === 'love' ? 1 : 0),
      }))
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
        <h2 className="display mb-3 text-display">Ya está</h2>
        <p className="mx-auto mb-8 max-w-xs text-small leading-relaxed text-ink-soft">
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
      {/*
        El abanico.

        Antes eran dos cartas: la de delante y una girada dos grados detrás.
        Ahora son hasta cuatro, abiertas en arco sobre un pivote que queda por
        DEBAJO de ellas —no en su centro— que es lo que hace que se abran como
        una mano de cartas en lugar de como un montón torcido.

        No es decoración: el abanico dice cuánto queda. Con doce looks por
        delante se ve lleno y con dos se ve casi agotado, sin tener que leer el
        contador. Y al arrastrar gira entero, como una rueda, así que el gesto
        mueve la baraja y no solo la carta de arriba.

        Las de detrás se dibujan de la más lejana a la más cercana para que el
        orden del DOM haga el apilado sin `z-index` negativos, que dentro de un
        contenedor con transformaciones dan resultados distintos según el
        navegador.
      */}
      <div className="relative h-[400px] pb-10">
        <div
          className="absolute inset-x-0 top-0 bottom-10"
          style={{
            transform: `rotate(${drag.x * 0.02}deg)`,
            transition: drag.active ? 'none' : 'transform 280ms ease-out',
          }}
        >
          {fan.map((c, i) => (
            <CardFace key={c.key} card={c} depth={fan.length - i} />
          ))}
        </div>

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
            transition: drag.active ? 'none' : 'transform 280ms ease-out, opacity 280ms ease-out',
            touchAction: 'none',
          }}
          className="absolute inset-x-0 top-0 bottom-10 cursor-grab active:cursor-grabbing"
        >
          <CardFace card={card} />

          <Stamp show={drag.x > 40} tone="like" label="Sí" />
          <Stamp show={drag.x < -40} tone="dislike" label="No" />
          <Stamp show={drag.y < -40 && Math.abs(drag.x) < 60} tone="love" label="Me encanta" />
        </div>

      {/*
        Los mandos, flotando sobre el abanico.

        Antes eran una fila debajo, separada de las cartas por un hueco. Puestos
        encima, la mano no tiene que salir de la zona donde está mirando para
        contestar, y la pantalla deja de partirse en "lo que miras" y "lo que
        pulsas".

        La cápsula es cristal de verdad —desenfoque del fondo— y por eso es
        oscura pase lo que pase con el modo del teléfono: está sobre las fotos
        de las prendas, no sobre la página, y ahí lo que manda es la foto.

        Esto arregla además un fallo que dejé al quitar el fondo negro de esta
        pantalla: los botones llevaban colores fijos de cuando todo aquí era
        oscuro, así que en modo claro el de "me encanta" era crema sobre crema.

        El orden es el de la intensidad: no, ni fu ni fa, sí, me encanta. Leído
        de izquierda a derecha es una escala, y eso ahorra explicar qué hace
        cada botón.
      */}
      <div className="glass-pill absolute inset-x-0 bottom-0 mx-auto flex w-fit items-center justify-center gap-2.5 rounded-full p-2.5">
        <ActionButton label="No me gusta" onClick={() => react('dislike')}>
          <IconCross />
        </ActionButton>
        <ActionButton label="Ni fu ni fa" onClick={() => react('skip')}>
          <IconSkip />
        </ActionButton>
        <ActionButton label="Me gusta" tone="yes" onClick={() => react('like')}>
          <span className="text-small font-medium">sí</span>
        </ActionButton>
        <ActionButton label="Me encanta" tone="love" onClick={() => react('love')}>
          <IconHeart />
        </ActionButton>
        </div>
      </div>

      {/*
        El eje.

        La rueda de la que sale esta idea lleva su rótulo en el centro del
        anillo. Aquí el anillo es un arco, así que el centro cae justo debajo:
        cuántas llevas y cómo se llama la que estás mirando, alineadas al eje
        del abanico. Antes el título iba a la izquierda y el contador cinco
        elementos más abajo, y no parecían la misma cosa.
      */}
      <div className="mt-4 text-center">
        <p className="mono text-ink-faint">
          {index + 1} / {initial.length}
          {counts.saved > 0 ? ` · ${counts.saved} guardados` : ''}
        </p>
        <h2 className="display mt-1.5 text-title">{card.title}</h2>
      </div>

      {error ? (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}


      <div className="mt-5 rounded-[18px] border border-line px-4 py-3.5">
        <p className="text-small leading-[1.5] text-ink-soft">
          {counts.saved >= 2
            ? 'Ya voy viendo por dónde vas. Lo que guardes pesa en lo que te proponga mañana.'
            : 'Cuanto más valores, menos te propongo cosas que no te pondrías.'}
        </p>
      </div>

      {askingReason ? <ReasonSheet onPick={onReason} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * Una carta.
 *
 * `depth` es cuántas hay por delante: 0 es la que se toca. El pivote en
 * `50% 128%` cae fuera de la carta, por debajo, y es lo que convierte un giro
 * en un abanico — girar sobre el propio centro solo las inclina unas encima de
 * otras.
 */
function CardFace({ card, depth = 0 }: { card: SwipeCard; depth?: number }) {
  const items = card.items.slice(0, 4)

  return (
    <div
      className={cn(
        'lift-paper h-full w-full rounded-[22px] border border-line p-2.5',
        depth > 0 && 'absolute inset-0',
      )}
      aria-hidden={depth > 0}
      style={
        depth > 0
          ? {
              transform: `rotate(${depth * 4.5}deg) translateY(${depth * -5}px) translateX(${depth * -3}px) scale(${1 - depth * 0.035})`,
              transformOrigin: '50% 128%',
              opacity: 1 - depth * 0.2,
            }
          : undefined
      }
    >
      <div
        className={cn(
          'grid h-full w-full gap-2',
          items.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2',
        )}
      >
        {items.map((item) => (
          <PhotoSlot
            key={item.id}
            src={item.imageUrl}
            label={item.name}
            className="h-full w-full rounded-[14px]"
          />
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
        'pointer-events-none absolute top-6 rounded-full border-2 px-4 py-1.5 text-small font-medium tracking-wide uppercase transition-opacity',
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
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  tone?: 'yes' | 'love'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        /*
         * Los colores son fijos y no tokens, y aquí sí es lo correcto: estos
         * botones viven dentro de una cápsula de cristal oscuro, que es oscura
         * en los dos modos. Si siguieran al tema, en modo oscuro serían tinta
         * sobre tinta.
         */
        'flex h-[50px] w-[50px] items-center justify-center rounded-full border transition-transform active:scale-90',
        tone === 'yes' && 'border-[#d8b48f] bg-[rgba(216,180,143,0.22)] text-[#e8d0b4]',
        tone === 'love' && 'border-transparent bg-[#f7f4ee] text-[#15140f]',
        !tone && 'border-[rgba(247,244,238,0.3)] text-[rgba(247,244,238,0.8)]',
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
                className="w-full rounded-2xl border border-line bg-raised px-4 py-3 text-left text-small active:bg-sunken"
              >
                {reason.label}
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => onPick(null)}
          className="w-full text-center text-small text-ink-soft underline underline-offset-4"
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
  // Relleno, no de línea: es el único botón sólido y tiene que leerse como tal.
  return (
    <svg {...strokeProps} fill="currentColor" stroke="none" width={18} height={18}>
      <path d="M12 20s-7-4.6-7-9.3A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.7C19 15.4 12 20 12 20z" />
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
