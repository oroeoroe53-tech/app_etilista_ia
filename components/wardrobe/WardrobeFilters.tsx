'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buildQuery, toggleFilter, hasAnyFilter, type WardrobeFilters } from '@/lib/wardrobe/filters'
import { LAYER_LABELS, SEASON_LABELS, colorLabel } from '@/lib/wardrobe/labels'
import { COLOR_SWATCHES } from '@/lib/style/describe'
import { cn } from '@/lib/utils/cn'
import type { Color, Layer, Season } from '@/lib/wardrobe/taxonomy'

/**
 * Filtros del armario.
 *
 * Son enlaces, no botones con estado: cada filtro es una URL. Así funcionan sin
 * JavaScript, el botón de atrás hace lo esperable y la lista se renderiza en el
 * servidor en vez de mandar el armario entero al navegador.
 *
 * Solo se ofrecen los valores que el armario tiene de verdad: filtrar por un
 * color del que no hay ninguna prenda solo sirve para llegar a una lista vacía.
 *
 * Las tiras se sangran a pantalla completa pero arrancan alineadas con el
 * título. Cortarlas en el margen haría pensar que ahí se acaban.
 */
interface Props {
  filters: WardrobeFilters
  availableLayers: Layer[]
  availableColors: Color[]
  availableSeasons: Season[]
  storedCount: number
}

export function WardrobeFilters({
  filters,
  availableLayers,
  availableColors,
  availableSeasons,
  storedCount,
}: Props) {
  const pathname = usePathname()
  const href = (next: WardrobeFilters) => `${pathname}${buildQuery(next)}`

  const extras = availableSeasons.length > 0 || storedCount > 0

  return (
    <div className="mb-5 space-y-[7px]">
      <Row label="Tipo">
        <Chip href={pathname} active={!filters.layer}>
          Todo
        </Chip>
        {availableLayers.map((layer) => (
          <Chip
            key={layer}
            href={href(toggleFilter(filters, 'layer', layer))}
            active={filters.layer === layer}
          >
            {LAYER_LABELS[layer] ?? layer}
          </Chip>
        ))}
      </Row>

      <Row label="Color">
        {availableColors.map((color) => (
          <Chip
            key={color}
            href={href(toggleFilter(filters, 'color', color))}
            active={filters.color === color}
            dot={COLOR_SWATCHES[color]}
          >
            {colorLabel(color)}
          </Chip>
        ))}
      </Row>

      {/*
        Tercera tira. El diseño solo maqueta dos, pero temporada y "guardadas"
        ya existían y son la única forma de llegar a una prenda archivada: si se
        quitaran, esas prendas dejarían de tener puerta.
      */}
      {extras ? (
        <Row label="Temporada">
          {availableSeasons.map((season) => (
            <Chip
              key={season}
              href={href(toggleFilter(filters, 'season', season))}
              active={filters.season === season}
            >
              {SEASON_LABELS[season] ?? season}
            </Chip>
          ))}
          {storedCount > 0 ? (
            <Chip
              href={href(toggleFilter(filters, 'available', false))}
              active={filters.available === false}
            >
              Guardadas · {storedCount}
            </Chip>
          ) : null}
        </Row>
      ) : null}

      {hasAnyFilter(filters) ? (
        <Link
          href={pathname}
          className="inline-block pt-1 text-[10.5px] text-ink-faint underline underline-offset-4"
        >
          Quitar filtros
        </Link>
      ) : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="sr-only">{label}</span>
      <div className="no-scrollbar bleed-row flex gap-[6px] overflow-x-auto py-1">{children}</div>
    </div>
  )
}

function Chip({
  href,
  active,
  dot,
  children,
}: {
  href: string
  active: boolean
  dot?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-[9px]',
        'text-[11.5px] font-medium whitespace-nowrap transition-colors',
        active
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-[color-mix(in_srgb,var(--ink)_16%,transparent)] text-ink-soft',
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className="h-[9px] w-[9px] shrink-0 rounded-full border border-line"
          style={{ backgroundColor: dot }}
        />
      ) : null}
      {children}
    </Link>
  )
}
