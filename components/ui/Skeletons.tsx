import { cn } from '@/lib/utils/cn'

/**
 * Esqueletos de carga.
 *
 * Lo importante de un esqueleto no es que se vea bonito mientras carga: es que
 * ocupe **exactamente** el sitio que va a ocupar el contenido. Si las medidas no
 * coinciden, la página da un salto al cargar y eso se percibe como lentitud
 * aunque los datos hayan llegado igual de rápido.
 *
 * Por eso cada esqueleto de aquí copia la maqueta de su pantalla, alturas y
 * radios incluidos. Cuando una pantalla cambia, su esqueleto cambia con ella o
 * deja de servir para nada.
 */

export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-sunken', className)} />
}

/** Cuadrícula del armario: tres columnas, huecos de 118px, con su pie de texto. */
export function WardrobeGridSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-7">
      {Array.from({ length: rows }).map((_, section) => (
        <section key={section}>
          <div className="mb-2.5 flex items-baseline justify-between">
            <Shimmer className="h-2 w-16 rounded" />
            <Shimmer className="h-2 w-14 rounded" />
          </div>
          <div className="rule mb-3" />
          <ul className="grid grid-cols-3 gap-[9px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <Shimmer className="h-[118px] w-full rounded-[14px]" />
                <Shimmer className="mt-1.5 h-2 w-3/4 rounded" />
                <Shimmer className="mt-1 h-2 w-1/2 rounded" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Ficha de prenda: foto a sangre de 400px y el cuerpo debajo. */
export function ItemDetailSkeleton() {
  return (
    <div className="pb-nav">
      <Shimmer className="h-[400px] w-full rounded-none" />
      <div
        className="mx-auto w-full max-w-[30rem] pt-5"
        style={{ paddingInline: 'var(--screen-gutter)' }}
      >
        <Shimmer className="h-2 w-28 rounded" />
        <Shimmer className="mt-2.5 h-8 w-2/3 rounded" />
        <div className="mt-3.5 flex gap-[6px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <Shimmer key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <div className="mt-5 flex gap-2.5">
          <Shimmer className="h-[88px] flex-1 rounded-[18px]" />
          <Shimmer className="h-[88px] flex-1 rounded-[18px]" />
        </div>
      </div>
    </div>
  )
}

/** Las tres tarjetas de "Tres opciones". */
export function OutfitListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[24px] bg-raised p-4 shadow-card-soft">
          <div className="mb-3 flex items-baseline justify-between">
            <Shimmer className="h-2 w-12 rounded" />
            <Shimmer className="h-2 w-16 rounded" />
          </div>
          <div className="flex gap-[7px]">
            {Array.from({ length: 4 }).map((_, j) => (
              <Shimmer key={j} className="h-24 flex-1 rounded-[13px]" />
            ))}
          </div>
          <Shimmer className="mt-3.5 h-5 w-1/2 rounded" />
          <Shimmer className="mt-2 h-3 w-4/5 rounded" />
          <div className="mt-4 flex gap-2.5">
            <Shimmer className="h-[46px] flex-1 rounded-full" />
            <Shimmer className="h-[46px] w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Portada.
 *
 * Es el esqueleto que más importa de los cinco: la portada es la pantalla que
 * más se abre y la que más tarda, porque el look de hoy puede tener que
 * componerse. Cada bloque está a la altura exacta del contenido real.
 */
export function CoverSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <div className="flex items-start justify-between gap-4 pt-5">
        <div className="min-w-0 flex-1">
          <Shimmer className="h-2 w-40 rounded" />
          <Shimmer className="mt-3 h-8 w-48 rounded" />
          <Shimmer className="mt-1.5 h-8 w-56 rounded" />
        </div>
        <Shimmer className="h-9 w-12 shrink-0 rounded" />
      </div>

      {/* La tarjeta del look: cabecera, rejilla 1.3fr/1fr, titular y botones. */}
      <div className="mt-5 rounded-[var(--radius-card)] bg-raised p-4 shadow-card">
        <div className="mb-3 flex items-baseline justify-between">
          <Shimmer className="h-2 w-20 rounded" />
          <Shimmer className="h-2 w-24 rounded" />
        </div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: '1.3fr 1fr', gridTemplateRows: '96px 96px' }}
        >
          {/* La primera celda ocupa las dos filas, como la prenda principal. */}
          <div style={{ gridRow: 'span 2' }} className="min-h-0">
            <Shimmer className="h-full w-full rounded-2xl" />
          </div>
          <Shimmer className="h-full w-full rounded-2xl" />
          <Shimmer className="h-full w-full rounded-2xl" />
        </div>
        <Shimmer className="mt-3.5 h-5 w-2/3 rounded" />
        <Shimmer className="mt-2 h-3 w-full rounded" />
        <div className="mt-4 flex gap-2.5">
          <Shimmer className="h-[46px] flex-1 rounded-full" />
          <Shimmer className="h-[46px] w-24 rounded-full" />
        </div>
      </div>

      <Shimmer className="mt-3.5 h-[62px] w-full rounded-[18px]" />

      <div className="mt-6">
        <Shimmer className="h-4 w-32 rounded" />
        <div className="mt-3 flex gap-[7px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} className="h-[70px] w-14 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Cabecera de sección: volanta y título. */
export function PageTitleSkeleton() {
  return (
    <div className="pt-5 pb-5">
      <Shimmer className="mb-3 h-2 w-20 rounded" />
      <Shimmer className="h-8 w-44 rounded" />
    </div>
  )
}
