'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

/**
 * Navegación principal (PLAN.md §32).
 *
 * Sin iconos: un punto de 5px sobre la etiqueta marca dónde estás.
 *
 * La maqueta los evita a propósito y la decisión se mantiene — dibujar cinco
 * iconos de línea obligaría a inventar un lenguaje gráfico que no existe en
 * ninguna otra parte de la aplicación, y cinco metáforas mediocres ("una
 * percha", "una chispa") ensucian más de lo que orientan. Con cinco destinos y
 * una palabra cada uno, la palabra basta.
 */
const TABS = [
  { href: '/', label: 'Inicio' },
  { href: '/armario', label: 'Armario' },
  { href: '/outfits', label: 'Outfits' },
  /*
   * Social ocupa el sitio que tenía Estilo.
   *
   * Estilo es una pantalla preciosa que se mira dos veces: la primera con
   * curiosidad y la segunda para enseñársela a alguien. Social tiene cosas que
   * caducan —votaciones con cuenta atrás, préstamos sin contestar— y eso es lo
   * que justifica un sitio en una barra de cinco. Estilo sigue entero, colgando
   * de Perfil.
   */
  { href: '/social', label: 'Social' },
  { href: '/perfil', label: 'Perfil' },
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
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t',
        dark ? 'on-dark border-[rgba(247,244,238,0.12)] bg-[#15140f]' : 'border-line bg-surface',
      )}
      style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
    >
      <ul className="mx-auto flex w-full max-w-[30rem] items-stretch px-6 pt-3">
        {TABS.map(({ href, label }) => {
          const active = current === href
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-[5px] py-1"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-[5px] w-[5px] rounded-full',
                    active ? 'bg-ink' : 'bg-transparent',
                  )}
                />
                <span
                  className={cn(
                    'text-[10px] leading-none',
                    active ? 'font-medium text-ink' : 'text-ink-faint',
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
