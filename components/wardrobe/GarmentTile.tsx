import { TransitionLink } from '@/components/transitions/TransitionLink'
import { cn } from '@/lib/utils/cn'

/**
 * Una prenda en la cuadrícula del armario.
 *
 * El nombre va DENTRO de la foto, no debajo. Es el cambio que separa un
 * catálogo de moda de una hoja de inventario: con el texto fuera, cada prenda
 * es una fila con una ilustración al lado; con el texto encima, la prenda es el
 * objeto y lo demás es rotulación.
 *
 * Esto obliga a un velo oscuro en el borde inferior, porque sobre una camisa
 * blanca el texto blanco no se lee. El velo es un degradado y no un bloque: un
 * bloque corta la foto por una línea recta y se ve el truco.
 *
 * Sin foto no hay velo ni texto blanco —el nombre va en tinta sobre la textura
 * diagonal— porque un velo sobre un hueco vacío solo lo ensucia.
 */
export function GarmentTile({
  href,
  src,
  name,
  meta,
  hero = false,
  className,
}: {
  /** Sin destino, la baldosa es solo imagen: el armario de ejemplo no navega. */
  href?: string
  src?: string | null
  name: string
  /** La línea de debajo: usos, o que está guardada o prestada. */
  meta?: string | null
  /** La primera de cada capa ocupa el ancho entero. */
  hero?: boolean
  className?: string
}) {
  const body = (
    <div
      className={cn(
        'relative overflow-hidden rounded-[18px]',
        // Retrato para las normales, apaisado para la que manda.
        hero ? 'aspect-[16/11]' : 'aspect-[3/4]',
        !src && 'photo-slot',
      )}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={name}
            loading="lazy"
            draggable={false}
            className="garment-photo h-full w-full object-cover"
          />
          <span aria-hidden className="tile-scrim" />
        </>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <p
          className={cn(
            'line-clamp-2 text-small leading-[1.25] font-medium',
            src ? 'tile-label text-white' : 'text-ink',
          )}
        >
          {name}
        </p>
        {meta ? (
          <p
            className={cn(
              'mt-0.5 text-micro',
              src ? 'tile-label text-white/70' : 'text-ink-faint',
            )}
          >
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  )

  if (!href) return <div className={className}>{body}</div>

  return (
    <TransitionLink href={href} sharedName="garment" className={cn('block', className)}>
      {body}
    </TransitionLink>
  )
}
