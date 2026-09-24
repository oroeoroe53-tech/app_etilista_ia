'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

/**
 * Navegación principal.
 *
 * Una cápsula que flota sobre el contenido, no una franja pegada al borde. La
 * diferencia no es decorativa: una barra anclada abajo parte la pantalla en dos
 * y hace de suelo; una cápsula deja que el contenido siga por debajo y sea la
 * página la que mande.
 *
 * Iconos. La versión anterior los evitaba a propósito —cinco metáforas
 * mediocres ensucian más de lo que orientan— y esa decisión se revierte aquí
 * por una razón concreta: con cinco palabras de 10px la barra no podía tener
 * jerarquía, y sin jerarquía no hay acción principal. Con iconos, el centro
 * puede ser un disco oscuro que se ve desde el otro lado de la habitación.
 *
 * Ese centro es Outfits: la pregunta por la que se abre esta aplicación.
 */

type Tab = {
  href: string
  label: string
  /** Trazado del icono, sobre una caja de 24×24. */
  path: string
  /** El disco oscuro del centro. Solo uno. */
  primary?: boolean
}

/*
 * Los trazados son de línea, todos con el mismo grosor y la misma caja, para
 * que ninguno pese más que otro salvo el que debe.
 */
const TABS: readonly Tab[] = [
  {
    href: '/',
    label: 'Inicio',
    path: 'M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  },
  {
    // Una percha: el único objeto que significa "armario" sin ambigüedad.
    href: '/armario',
    label: 'Armario',
    path: 'M12 4.5a2 2 0 0 0-2 2c0 1 .8 1.7 2 2v2m0 0L3.6 16.1a1 1 0 0 0 .6 1.8h15.6a1 1 0 0 0 .6-1.8L12 10.5z',
  },
  {
    /*
     * Una chispa. No describe un outfit —nada lo hace en 24 píxeles— pero sí
     * describe lo que pasa al pulsar, que es lo que importa en el botón que
     * carga el gesto principal.
     */
    href: '/outfits',
    label: 'Outfits',
    path: 'M12 3.2l1.9 4.9 4.9 1.9-4.9 1.9L12 16.8l-1.9-4.9L5.2 10l4.9-1.9zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
    primary: true,
  },
  {
    href: '/social',
    label: 'Social',
    path: 'M9 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 9 11m7.2-.4a2.8 2.8 0 1 0 0-5.6M2.8 19.4c0-2.7 2.8-4.3 6.2-4.3s6.2 1.6 6.2 4.3M17 15.4c2.6.3 4.2 1.6 4.2 3.6',
  },
  {
    href: '/perfil',
    label: 'Perfil',
    path: 'M12 11.8a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8M4.8 20.4c0-3.2 3.2-5.2 7.2-5.2s7.2 2 7.2 5.2',
  },
] as const

/**
 * Pantallas oscuras.
 *
 * La barra vive fuera de la página, así que no hereda el subárbol `.on-dark`:
 * tiene que reconocer la ruta por su cuenta. Es una lista, no una heurística,
 * para que añadir una pantalla negra sea una decisión y no un accidente.
 */
const DARK_ROUTES = ['/outfits/swipe']

/** El diario es historial de lo que te pusiste: pertenece a Outfits. */
function activeTab(pathname: string): string {
  if (pathname === '/') return '/'
  if (pathname.startsWith('/armario')) return '/armario'
  if (pathname.startsWith('/estilo')) return '/perfil'
  // Todo lo social vive bajo la misma pestaña aunque tenga rutas propias.
  for (const prefix of ['/social', '/circulo', '/prestamos', '/eventos', '/vestir', '/votacion']) {
    if (pathname.startsWith(prefix)) return '/social'
  }
  if (pathname.startsWith('/perfil')) return '/perfil'
  if (pathname.startsWith('/outfits') || pathname.startsWith('/diario')) return '/outfits'
  return ''
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[21px] w-[21px]"
    >
      <path d={path} />
    </svg>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const dark = DARK_ROUTES.some((route) => pathname.startsWith(route))
  const current = activeTab(pathname)

  return (
    <nav
      aria-label="Navegación principal"
      className={cn('fixed inset-x-0 bottom-0 z-40', dark && 'on-dark')}
      style={{
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
        /*
         * `.on-dark` redefine las variables Y pinta el fondo. Lo segundo aquí
         * dibujaría una banda negra a lo ancho detrás de la cápsula, que es
         * justo lo que esta barra deja de ser. Solo queremos las variables.
         */
        background: 'transparent',
      }}
    >
      <ul
        className={cn(
          'mx-auto flex w-[min(23rem,calc(100%-2rem))] items-center justify-between',
          'rounded-full border border-line bg-raised px-2.5 py-2 shadow-float',
          // El disco sobresale por arriba; sin esto quedaría recortado.
          'relative',
        )}
      >
        {TABS.map(({ href, label, path, primary }) => {
          const active = current === href

          if (primary) {
            return (
              <li key={href} className="px-1">
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-[52px] w-[52px] -translate-y-[9px] items-center justify-center rounded-full',
                    'bg-accent text-accent-ink shadow-float-strong',
                    'transition-transform duration-200 active:scale-[0.93]',
                  )}
                >
                  <Icon path={path} />
                </Link>
              </li>
            )
          }

          return (
            <li key={href}>
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[42px] w-[46px] items-center justify-center rounded-full',
                  'transition-colors duration-200',
                  active ? 'bg-sunken text-ink' : 'text-ink-faint',
                )}
              >
                <Icon path={path} />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
