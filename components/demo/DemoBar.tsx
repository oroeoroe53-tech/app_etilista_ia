'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

/**
 * Pie de la demostración.
 *
 * Dos franjas. Arriba la llamada, que es lo que esta pantalla existe para
 * conseguir. Debajo tres pestañas con la misma forma que las de la aplicación
 * de verdad, para que lo que se está viendo se lea como la aplicación y no
 * como un folleto sobre la aplicación.
 *
 * La llamada dice "con tu ropa" y no "registrarse": lo que se ofrece es un
 * armario propio, no un formulario.
 */
const TABS = [
  { href: '/demo', label: 'Hoy' },
  { href: '/demo/armario', label: 'Armario' },
  { href: '/demo/looks', label: 'Looks' },
] as const

export function DemoBar() {
  const pathname = usePathname()

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <Link
        href="/register"
        className="block bg-accent px-6 py-3.5 text-center text-accent-ink"
      >
        <span className="text-small font-medium tracking-[0.03em]">
          Hacer esto con tu ropa
        </span>
        <span aria-hidden className="ml-2 text-small">
          →
        </span>
      </Link>

      <nav
        aria-label="Demostración"
        className="border-t border-line bg-surface"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        <ul className="mx-auto flex w-full max-w-[30rem] items-stretch px-6 pt-3">
          {TABS.map(({ href, label }) => {
            const active = pathname === href
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
                      'text-micro leading-none',
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
    </div>
  )
}
