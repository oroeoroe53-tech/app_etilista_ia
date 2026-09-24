'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { NavIcon, type NavIconName } from './icons'

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
  icon: NavIconName
  /** El disco oscuro del centro. Solo uno. */
  primary?: boolean
}

const TABS: readonly Tab[] = [
  { href: '/', label: 'Inicio', icon: 'inicio' },
  { href: '/armario', label: 'Armario', icon: 'armario' },
  { href: '/outfits', label: 'Outfits', icon: 'outfits', primary: true },
  { href: '/social', label: 'Social', icon: 'social' },
  { href: '/perfil', label: 'Perfil', icon: 'perfil' },
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
        {TABS.map(({ href, label, icon, primary }) => {
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
                    'press bg-accent text-accent-ink shadow-float-strong',
                  )}
                >
                  <NavIcon name={icon} />
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
                <NavIcon name={icon} />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
