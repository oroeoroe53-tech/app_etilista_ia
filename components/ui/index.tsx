import { cn } from '@/lib/utils/cn'

export { Button } from './Button'
export { Field, Select, TextInput, TextArea, ChipGroup, ScaleInput } from './Field'

/** Contenedor de página. Ancho contenido para que en tablet no se estire feo. */
export function Screen({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-lg px-5 pt-safe pb-nav', className)}>{children}</div>
  )
}

export function PageTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <header className="pt-8 pb-6">
      {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
      <h1 className="display text-4xl">{title}</h1>
    </header>
  )
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-raised p-5',
        className,
      )}
    >
      {children}
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
        'shrink-0 rounded-full border px-4 h-9 text-sm transition-colors',
        selected
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-raised text-ink-soft',
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
      <p className="max-w-xs text-sm leading-relaxed text-ink-soft">{body}</p>
      {action ? <div className="pt-3">{action}</div> : null}
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
        'rounded-2xl px-4 py-3 text-sm leading-relaxed',
        tone === 'error'
          ? 'bg-danger/10 text-danger'
          : 'bg-sunken text-ink-soft',
      )}
    >
      {children}
    </p>
  )
}
