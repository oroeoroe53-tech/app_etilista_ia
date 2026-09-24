'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { NavIcon, type NavIconName } from '@/components/nav/icons'

/**
 * Pie de la demostración.
 *
 * Dos piezas apiladas y las dos flotando: arriba la llamada, que es lo que esta
 * pantalla existe para conseguir, y debajo la misma cápsula que lleva la
 * aplicación de verdad, con los mismos iconos importados del mismo sitio.
 *
 * Eso último es el motivo de que esto exista. Quien está mirando sin cuenta
 * tiene que estar viendo la aplicación, no un folleto sobre la aplicación; en
 * cuanto las dos barras se parecen solo "de memoria", la primera se queda
 * antigua y la demostración empieza a enseñar algo que ya no es verdad.
 *
 * La llamada dice "con tu ropa" y no "registrarse": lo que se ofrece es un
 * armario propio, no un formulario.
 */
const TABS: readonly { href: string; label: string; icon: NavIconName }[] = [
  { href: '/demo', label: 'Hoy', icon: 'inicio' },
  { href: '/demo/armario', label: 'Armario', icon: 'armario' },
  { href: '/demo/looks', label: 'Looks', icon: 'outfits' },
] as const

export function DemoBar() {
  const pathname = usePathname()

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40"
      style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex w-[min(23rem,calc(100%-2rem))] flex-col gap-2.5">
        <Link
          href="/register"
          className="press flex items-center justify-center rounded-full bg-accent px-6 py-3.5 text-accent-ink shadow-float-strong"
        >
          <span className="text-small font-medium tracking-[0.03em]">
            Hacer esto con tu ropa
          </span>
          <span aria-hidden className="ml-2 text-small">
            →
          </span>
        </Link>

        <nav aria-label="Demostración">
          <ul className="flex items-center justify-around rounded-full border border-line bg-raised px-2.5 py-2 shadow-float">
            {TABS.map(({ href, label, icon }) => {
              const active = pathname === href
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-[42px] w-[46px] items-center justify-center rounded-full transition-colors duration-200',
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
      </div>
    </div>
  )
}
