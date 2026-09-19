'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buildQuery, toggleFilter, hasAnyFilter, type WardrobeFilters } from '@/lib/wardrobe/filters'
import { LAYER_LABELS, SEASON_LABELS, colorLabel } from '@/lib/wardrobe/labels'
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

  return (
    <div className="mb-6 space-y-2">
      <Row label="Tipo">
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
          >
            {colorLabel(color)}
          </Chip>
        ))}
      </Row>

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
            Guardadas ({storedCount})
          </Chip>
        ) : null}
      </Row>

      {hasAnyFilter(filters) ? (
        <Link
          href={pathname}
          className="inline-block pt-1 text-xs text-ink-soft underline underline-offset-4"
        >
          Quitar filtros
        </Link>
      ) : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1">{children}</div>
    </div>
  )
}

function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'shrink-0 rounded-full border px-4 py-1.5 text-sm whitespace-nowrap transition-colors',
        active
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-raised text-ink-soft',
      )}
    >
      {children}
    </Link>
  )
}
