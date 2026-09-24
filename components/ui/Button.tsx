import { cn } from '@/lib/utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

/**
 * Botones.
 *
 * Todos son cápsulas y todos son pequeños de letra. El diseño usa 12–13px con
 * un poco de tracking en lugar de la talla habitual de aplicación: leerlo
 * cuesta lo mismo y el conjunto se parece más a una etiqueta de ropa que a un
 * formulario.
 *
 * El secundario no lleva fondo propio. Sobre crema y sobre negro funciona
 * igual, que es lo que permite reutilizarlo tal cual dentro de "Descubre".
 *
 * Al pulsar se hunde: la clase `press` de `globals.css`, donde está explicado
 * por qué y por qué no es la variante de Tailwind.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink active:opacity-85',
  secondary: 'bg-transparent text-ink border border-[color-mix(in_srgb,var(--ink)_18%,transparent)] active:bg-sunken',
  ghost: 'text-ink-soft active:bg-sunken',
  danger: 'bg-transparent text-danger border border-danger/40 active:bg-danger/10',
}

const SIZES: Record<Size, string> = {
  // 44px de alto mínimo: es el objetivo táctil que recomienda Apple.
  sm: 'h-11 px-4 text-small',
  md: 'h-[46px] px-5 text-small',
  lg: 'h-[54px] px-6 text-small',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.03em]',
        'press disabled:opacity-40 disabled:pointer-events-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  )
}
