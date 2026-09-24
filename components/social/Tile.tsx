import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/**
 * Una pieza del mosaico de Social.
 *
 * Sustituye a la fila. Una fila solo puede llevar un título, una frase gris y
 * una flecha, y por eso ocho de ellas seguidas se leen como una pantalla de
 * ajustes: todas pesan lo mismo, y ninguna puede enseñar lo que tiene dentro.
 *
 * Una pieza sí. Cabe un número grande, una cuenta atrás corriendo o una foto, y
 * puede ocupar más sitio cuando tiene algo que decir. Eso es lo que convierte
 * una lista de destinos en un tablero de lo que está pasando.
 *
 * El texto va abajo, como en las baldosas del armario, para que las dos
 * cuadrículas de la aplicación se lean con la misma gramática.
 */
export function Tile({
  href,
  eyebrow,
  title,
  note,
  badge,
  tone = 'outline',
  span,
  children,
}: {
  href: string
  eyebrow?: string
  title: string
  /** La línea de debajo. Lo que hay ahora, no una descripción de la sección. */
  note?: React.ReactNode
  /** El número que apremia: votos sin contestar, looks sin ver. */
  badge?: number
  /** `ink` es la pieza negra. Solo una por pantalla, o deja de destacar. */
  tone?: 'outline' | 'raised' | 'ink'
  /** Columnas de la rejilla de seis. Lo calcula `packTiles`. */
  span: number
  /** Lo que solo esta pieza sabe enseñar: una cuenta atrás, unas miniaturas. */
  children?: React.ReactNode
}) {
  return (
    <li style={{ gridColumn: `span ${span} / span ${span}` }}>
      <Link
        href={href}
        className={cn(
          'press relative flex h-full min-h-[108px] flex-col justify-end overflow-hidden rounded-[22px] p-3.5',
          tone === 'outline' && 'border border-line',
          tone === 'raised' && 'bg-raised shadow-card-soft',
          tone === 'ink' && 'bg-accent text-accent-ink',
        )}
      >
        {eyebrow ? (
          <span
            className={cn(
              'eyebrow absolute top-3.5 left-3.5',
              tone === 'ink' && 'eyebrow-on-ink',
            )}
          >
            {eyebrow}
          </span>
        ) : null}

        {badge ? (
          <span className="mono absolute top-3 right-3 rounded-full bg-clay px-2 py-[3px] text-[9px] text-[#f7f4ee]">
            {badge}
          </span>
        ) : null}

        {children ? <div className="mb-2">{children}</div> : null}

        <span className="display block text-lead leading-[1.15]">{title}</span>
        {note ? (
          <span
            className={cn(
              'mt-1 block text-micro leading-[1.4]',
              tone === 'ink' ? 'text-accent-ink/65' : 'text-ink-soft',
            )}
          >
            {note}
          </span>
        ) : null}
      </Link>
    </li>
  )
}
