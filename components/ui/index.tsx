import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { HeaderLight } from './HeaderLight'

export { Button } from './Button'
export { Field, Select, TextInput, TextArea, ChipGroup, ScaleInput } from './Field'
export { HeaderLight } from './HeaderLight'

/**
 * Contenedor de página.
 *
 * El margen lateral (26px) sale de `--screen-gutter` y no de una clase suelta,
 * porque las tiras horizontales que se sangran a pantalla completa tienen que
 * volver a alinearse exactamente con él.
 *
 * El ancho máximo es el de un móvil grande: esto se diseñó a 390px y estirarlo
 * en una tablet no lo mejora, solo lo desparrama.
 */
export function Screen({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[30rem] pt-safe pb-nav', className)}
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      {children}
    </div>
  )
}

/**
 * Cabecera de pantalla: volanta monoespaciada y título en serif.
 *
 * `action` es para el caso del Armario, donde el botón de añadir va en la misma
 * línea que el título y no debajo. Se alinea al final de la línea base del
 * título para que no flote.
 */
export function PageTitle({
  eyebrow,
  title,
  action,
  light = true,
}: {
  eyebrow?: string
  title: React.ReactNode
  action?: React.ReactNode
  /** A false donde la luz ya la pone el fondo de la página: si no, se suman. */
  light?: boolean
}) {
  return (
    <header className="relative pt-5 pb-5">
      {/* La luz va aquí y no pantalla a pantalla: esta es la cabecera que
          comparten Armario, Diario, Eventos y las demás. */}
      {light ? <HeaderLight /> : null}
      {eyebrow ? <p className="eyebrow relative mb-2.5">{eyebrow}</p> : null}
      <div className="relative flex items-center justify-between gap-4">
        <h1 className="display text-display">{title}</h1>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  )
}

/** "← armario". Textual y arriba a la izquierda, como en las subpantallas. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="pt-5 pb-1">
      <Link href={href} className="inline-block py-1 text-small text-ink-soft">
        ← {children}
      </Link>
    </div>
  )
}

/**
 * Fila discreta hacia otra pantalla.
 *
 * Para lo que tiene que estar y no tiene que gritar: el diario, la maleta.
 * Existe, se encuentra buscándola, y no le quita el sitio a lo que sí es la
 * respuesta de la pantalla.
 */
export function QuietRow({
  href,
  title,
  children,
}: {
  href: string
  title: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center justify-between gap-4 border-t border-line py-3.5 last:border-b',
        // Una fila no se puede hundir sin despegarse de las de al lado: lo que
        // cede aquí es el fondo, que se enciende un instante bajo el dedo.
        'transition-colors duration-200 active:bg-sunken',
      )}
    >
      <span className="min-w-0">
        <span className="display block text-lead">{title}</span>
        <span className="mt-0.5 block truncate text-small text-ink-soft">{children}</span>
      </span>
      <span aria-hidden className="shrink-0 text-small text-ink-faint">
        →
      </span>
    </Link>
  )
}

export function Card({
  children,
  className,
  tone = 'raised',
}: {
  children: React.ReactNode
  className?: string
  /** `ink` es la tarjeta negra: invierte el texto sin tocar los hijos. */
  tone?: 'raised' | 'outline' | 'ink'
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] p-4',
        tone === 'raised' && 'bg-raised shadow-card',
        tone === 'outline' && 'border border-line',
        tone === 'ink' && 'bg-accent text-accent-ink',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Hueco de foto.
 *
 * Cuando no hay imagen no se deja un rectángulo vacío: va la textura diagonal
 * del diseño con el nombre de la prenda en monoespaciada abajo a la izquierda.
 * Un armario a medio analizar tiene que seguir pareciendo un armario.
 */
export function PhotoSlot({
  src,
  label,
  className,
  showLabel = true,
  ...rest
}: {
  src?: string | null
  label: string
  className?: string
  showLabel?: boolean
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>) {
  return (
    <div
      className={cn('relative overflow-hidden', !src && 'photo-slot', className)}
      {...rest}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={label}
          loading="lazy"
          draggable={false}
          className="garment-photo h-full w-full object-cover"
        />
      ) : showLabel ? (
        <span className="mono absolute bottom-2 left-2.5 max-w-[85%] text-ink-faint">
          {label.toLowerCase()}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Barra de progreso fina.
 *
 * Se usa para dos cosas distintas —lo consumido del plan y lo cubierto de una
 * carencia del armario— y por eso el color es un parámetro: la tinta mide algo
 * tuyo, la arcilla señala algo que falta.
 */
export function Meter({
  value,
  label,
  tone = 'ink',
  className,
}: {
  /** 0–100. */
  value: number
  label: string
  tone?: 'ink' | 'clay'
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-full bg-sunken', className ?? 'h-[3px]')}
    >
      <div
        className={cn('h-full rounded-full', tone === 'ink' ? 'bg-accent' : 'bg-clay')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Chip({
  children,
  selected,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'shrink-0 rounded-full border px-3.5 py-[9px] text-small font-medium whitespace-nowrap transition-colors',
        selected
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-[color-mix(in_srgb,var(--ink)_16%,transparent)] bg-transparent text-ink-soft',
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-sunken', className)} />
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h2 className="display text-2xl">{title}</h2>
      <p className="max-w-xs text-small leading-[1.5] text-ink-soft">{body}</p>
      {action ? <div className="w-full pt-4">{action}</div> : null}
    </div>
  )
}

/** Aviso de error que no rompe la pantalla (PLAN.md §35). */
export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'error'
  children: React.ReactNode
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'rounded-[18px] px-4 py-3 text-small leading-[1.5]',
        tone === 'error' ? 'bg-danger/10 text-danger' : 'border border-line text-ink-soft',
      )}
    >
      {children}
    </p>
  )
}
