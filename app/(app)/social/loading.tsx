import { Shimmer } from '@/components/ui/Skeletons'

/**
 * Lo que se ve al tocar la pestaña Social.
 *
 * Sin esto, tocar la pestaña no hacía **nada** visible hasta que el servidor
 * contestaba: la pantalla anterior se quedaba quieta y parecía que el toque no
 * había entrado. Es la sensación de lentitud más cara de todas, porque ocurre
 * antes de que empiece a cargar nada.
 *
 * Tiene la forma de la pantalla que viene —cabecera, tarjeta de racha, filas—
 * para que al llegar el contenido no dé un salto.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="pt-5 pb-5">
        <Shimmer className="h-2 w-28" />
        <Shimmer className="mt-4 h-7 w-3/4" />
        <Shimmer className="mt-2 h-7 w-1/2" />
      </header>

      <div className="flex items-center gap-4 rounded-[var(--radius-card)] bg-raised p-4 shadow-card">
        <Shimmer className="h-11 w-11 rounded-full" />
        <div className="flex-1">
          <Shimmer className="h-3 w-full" />
          <Shimmer className="mt-3 h-1.5 w-full rounded-full" />
        </div>
      </div>

      <div className="mt-8 space-y-2.5">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="rounded-[22px] border border-line p-3.5">
            <Shimmer className="h-4 w-40" />
            <Shimmer className="mt-2 h-2.5 w-56" />
          </div>
        ))}
      </div>
    </div>
  )
}
