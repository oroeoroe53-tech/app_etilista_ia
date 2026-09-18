'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

/**
 * Navegación principal (PLAN.md §32).
 * Fija abajo porque es una aplicación de móvil que se usa con una mano.
 */
const TABS = [
  { href: '/', label: 'Inicio', icon: IconHome },
  { href: '/armario', label: 'Armario', icon: IconHanger },
  { href: '/outfits', label: 'Outfits', icon: IconSparkle },
  { href: '/estilo', label: 'Estilo', icon: IconChart },
  { href: '/perfil', label: 'Perfil', icon: IconUser },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[10px] tracking-wide',
                  active ? 'text-ink' : 'text-ink-faint',
                )}
              >
                <Icon filled={active} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* --- Iconos -----------------------------------------------------------------
 * Dibujados a mano en lugar de instalar una librería de iconos: son cinco, y
 * así el bundle no crece por cinco glifos.
 * -------------------------------------------------------------------------- */

interface IconProps {
  filled?: boolean
}

function base(filled?: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: filled ? 2 : 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
}

function IconHome({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  )
}

function IconHanger({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <path d="M12 7a2 2 0 1 1 2-2" />
      <path d="M12 7v2.5L3.6 15.4A1.5 1.5 0 0 0 4.5 18h15a1.5 1.5 0 0 0 .9-2.6L12 9.5" />
    </svg>
  )
}

function IconSparkle({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
      <path d="M18.5 16.5 19 18l1.5.5-1.5.5-.5 1.5-.5-1.5L16.5 18l1.5-.5z" />
    </svg>
  )
}

function IconChart({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <path d="M4 19.5V13" />
      <path d="M10 19.5V6" />
      <path d="M16 19.5v-9" />
      <path d="M22 19.5H2" />
    </svg>
  )
}

function IconUser({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}
