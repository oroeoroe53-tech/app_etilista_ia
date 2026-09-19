import { cn } from '@/lib/utils/cn'

/**
 * Primitivos de formulario.
 *
 * Todos funcionan sin JavaScript: son `select`, `input` y `checkbox` nativos
 * dentro de un `form`. Eso mantiene la edición del armario utilizable mientras
 * la página se hidrata, y hace que el teclado y el lector de pantalla del móvil
 * se comporten como la persona espera.
 */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span> : null}
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs text-danger">
          {error}
        </span>
      ) : null}
    </label>
  )
}

const CONTROL =
  'h-12 w-full rounded-2xl border border-line bg-raised px-4 text-base text-ink outline-none focus:border-ink-soft'

export function Select({
  options,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  return (
    <select className={cn(CONTROL, 'appearance-none pr-10', className)} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      className={cn(
        'w-full rounded-2xl border border-line bg-raised px-4 py-3 text-base text-ink outline-none focus:border-ink-soft',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Grupo de casillas con aspecto de etiqueta.
 *
 * Es un `input type=checkbox` de verdad con la casilla oculta: se envía con el
 * formulario, se navega con el teclado y el lector de pantalla lo anuncia bien,
 * pero parece una pastilla.
 */
export function ChipGroup({
  name,
  options,
  selected,
  columns = 'auto',
}: {
  name: string
  options: ReadonlyArray<{ value: string; label: string }>
  selected: readonly string[]
  columns?: 'auto' | 2
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', columns === 2 && 'grid grid-cols-2')}>
      {options.map((option) => (
        <label
          key={option.value}
          className="cursor-pointer has-checked:border-accent has-checked:bg-accent
                     has-checked:text-accent-ink rounded-full border border-line bg-raised
                     px-4 py-2 text-sm text-ink-soft transition-colors"
        >
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={selected.includes(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}

/** Escala de 1 a 5 con sus extremos explicados. Para formalidad y abrigo. */
export function ScaleInput({
  name,
  value,
  labels,
}: {
  name: string
  value: number
  labels: Record<number, string>
}) {
  return (
    <div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="flex-1 cursor-pointer has-checked:border-accent has-checked:bg-accent
                       has-checked:text-accent-ink rounded-xl border border-line bg-raised
                       py-2.5 text-center text-sm text-ink-soft transition-colors"
          >
            <input
              type="radio"
              name={name}
              value={n}
              defaultChecked={n === value}
              className="sr-only"
            />
            {n}
          </label>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-faint">
        <span>{labels[1]}</span>
        <span>{labels[5]}</span>
      </div>
    </div>
  )
}
