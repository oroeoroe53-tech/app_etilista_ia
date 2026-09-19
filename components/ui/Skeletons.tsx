import { cn } from '@/lib/utils/cn'

/**
 * Esqueletos de carga.
 *
 * Lo importante de un esqueleto no es que se vea bonito mientras carga: es que
 * ocupe **exactamente** el sitio que va a ocupar el contenido. Si las medidas no
 * coinciden, la página da un salto al cargar y eso se percibe como lentitud
 * aunque los datos hayan llegado igual de rápido.
 *
 * Por eso cada esqueleto de aquí copia la maqueta de su pantalla, proporción de
 * imagen incluida.
 */

export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-sunken', className)} />
}

/** Cuadrícula del armario: tres columnas, proporción 3:4, con su pie de texto. */
export function WardrobeGridSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-8">
      {Array.from({ length: rows }).map((_, section) => (
        <section key={section}>
          <Shimmer className="mb-3 h-2.5 w-16 rounded" />
          <ul className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <Shimmer className="aspect-3/4 w-full" />
                <Shimmer className="mt-1.5 h-2 w-3/4 rounded" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Ficha de prenda: foto grande y una lista de atributos. */
export function ItemDetailSkeleton() {
  return (
    <div>
      <Shimmer className="mb-6 aspect-3/4 w-full rounded-[var(--radius-card)]" />
      <Shimmer className="mb-6 h-8 w-2/3 rounded" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between border-b border-line pb-3">
            <Shimmer className="h-3 w-20 rounded" />
            <Shimmer className="h-3 w-28 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tres looks, cada uno con su fila de prendas. */
export function OutfitListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-b border-line pb-8 last:border-0">
          <Shimmer className="mb-4 h-2.5 w-14 rounded" />
          <div className="mb-4 flex gap-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="w-28 shrink-0">
                <Shimmer className="aspect-3/4 w-full" />
                <Shimmer className="mt-1.5 h-2 w-full rounded" />
              </div>
            ))}
          </div>
          <Shimmer className="h-3 w-full rounded" />
          <Shimmer className="mt-2 h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  )
}

/** Portada: la foto a sangre y el bloque de la acción principal. */
export function CoverSkeleton() {
  return (
    <div className="pb-nav">
      <Shimmer className="h-[78dvh] min-h-[30rem] w-full rounded-none" />
      <div className="mx-auto w-full max-w-lg px-5">
        <Shimmer className="-mt-8 relative h-32 w-full rounded-none" />
        <div className="mt-10 space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-t border-line pt-5">
              <Shimmer className="h-6 w-32 rounded" />
              <Shimmer className="mt-2 h-3 w-48 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Cabecera de sección: volanta y título. */
export function PageTitleSkeleton() {
  return (
    <div className="pt-8 pb-6">
      <Shimmer className="mb-3 h-2.5 w-20 rounded" />
      <Shimmer className="h-10 w-48 rounded" />
    </div>
  )
}
