import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment, LAYER_LABELS } from '@/lib/wardrobe/labels'
import { layerOf, type Category, type Color, type Layer, type Season } from '@/lib/wardrobe/taxonomy'
import { parseFilters, hasAnyFilter } from '@/lib/wardrobe/filters'
import { WardrobeFilters } from '@/components/wardrobe/WardrobeFilters'
import { TransitionLink } from '@/components/transitions/TransitionLink'
import { Screen, PageTitle, EmptyState, Button } from '@/components/ui'

export const dynamic = 'force-dynamic'

interface ItemRow {
  id: string
  category: string
  primary_color: string
  secondary_colors: string[]
  fit: string | null
  pattern: string | null
  seasons: string[]
  image_path: string | null
  is_available: boolean
  user_verified: boolean
  ai_confidence: number | null
}

const LAYER_ORDER: Layer[] = ['top', 'bottom', 'outer', 'full_body', 'footwear', 'accessory']

/**
 * Armario.
 *
 * Agrupado por capa y no por categoría suelta: en un móvil se ve de un vistazo
 * qué hay arriba, abajo y de abrigo, que es como se piensa al vestirse.
 *
 * Los filtros se aplican en memoria y no en SQL. Con los tamaños de armario que
 * permite el plan (hasta 300 prendas) la consulta es una sola y la diferencia es
 * imperceptible; a cambio, se pueden calcular los filtros disponibles a partir
 * del armario completo y no ofrecer opciones que no lleven a ninguna parte.
 */
export default async function WardrobePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const filters = parseFilters(await searchParams)

  const supabase = await createClient()
  const { data } = await supabase
    .from('clothing_items')
    .select(
      'id, category, primary_color, secondary_colors, fit, pattern, seasons, image_path, is_available, user_verified, ai_confidence',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const all = (data ?? []) as unknown as ItemRow[]

  if (all.length === 0) {
    return (
      <Screen>
        <PageTitle eyebrow="Lo que tienes" title="Armario" />
        <EmptyState
          title="Todavía está vacío"
          body="Sube unas cuantas fotos de looks que ya lleves y crearé tu armario a partir de ellas."
          action={
            <div className="space-y-3">
              <Link href="/onboarding" className="block">
                <Button fullWidth>Enséñame cómo vistes</Button>
              </Link>
              <Link href="/armario/nueva" className="block">
                <Button variant="secondary" fullWidth>
                  Añadir una prenda a mano
                </Button>
              </Link>
            </div>
          }
        />
      </Screen>
    )
  }

  // Opciones de filtro a partir del armario real, no de la taxonomía entera.
  const availableLayers = LAYER_ORDER.filter((layer) =>
    all.some((i) => layerOf(i.category as Category) === layer),
  )
  const availableColors = [...new Set(all.map((i) => i.primary_color))].sort() as Color[]
  const availableSeasons = (['spring', 'summer', 'autumn', 'winter'] as Season[]).filter((s) =>
    all.some((i) => i.seasons.includes(s)),
  )
  const storedCount = all.filter((i) => !i.is_available).length

  const visible = all.filter((item) => {
    if (filters.layer && layerOf(item.category as Category) !== filters.layer) return false
    if (filters.color && item.primary_color !== filters.color) return false
    if (filters.season && !item.seasons.includes(filters.season)) return false
    if (filters.available !== null && item.is_available !== filters.available) return false
    // Sin filtro explícito de estado, las guardadas no estorban en la vista general.
    if (filters.available === null && !item.is_available && !hasAnyFilter(filters)) return false
    return true
  })

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    visible.map((i) => i.image_path).filter((p): p is string => Boolean(p)),
    user.id,
  )

  const grouped = new Map<Layer, ItemRow[]>()
  for (const item of visible) {
    const layer = layerOf(item.category as Category) ?? 'accessory'
    grouped.set(layer, [...(grouped.get(layer) ?? []), item])
  }

  const porRevisar = all.filter((i) => !i.user_verified && (i.ai_confidence ?? 1) < 0.6).length

  return (
    <Screen>
      <PageTitle
        eyebrow={`${all.length} ${all.length === 1 ? 'prenda' : 'prendas'}`}
        title="Armario"
      />

      <WardrobeFilters
        filters={filters}
        availableLayers={availableLayers}
        availableColors={availableColors}
        availableSeasons={availableSeasons}
        storedCount={storedCount}
      />

      {porRevisar > 0 && !hasAnyFilter(filters) ? (
        <p className="mb-6 rounded-2xl bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-soft">
          {porRevisar === 1
            ? 'Hay una prenda que no vi con claridad. Échale un vistazo cuando puedas.'
            : `Hay ${porRevisar} prendas que no vi con claridad. Échales un vistazo cuando puedas.`}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="Nada con esos filtros"
          body="Prueba a quitar alguno."
          action={
            <Link href="/armario">
              <Button variant="secondary">Quitar filtros</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {LAYER_ORDER.filter((layer) => grouped.has(layer)).map((layer) => (
            <section key={layer}>
              <h2 className="eyebrow mb-3">{LAYER_LABELS[layer] ?? layer}</h2>
              <ul className="grid grid-cols-3 gap-2">
                {grouped.get(layer)!.map((item) => {
                  const url = item.image_path ? signed.get(item.image_path) : null
                  const nombre = describeGarment(item)
                  return (
                    <li key={item.id}>
                      <TransitionLink
                        href={`/armario/${item.id}`}
                        sharedName="garment"
                        className="block"
                      >
                        <div className="relative overflow-hidden rounded-2xl border border-line bg-sunken">
                          {url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={url}
                              alt={nombre}
                              loading="lazy"
                              className="garment-photo aspect-3/4 w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-3/4 w-full items-center justify-center px-2 text-center text-[10px] leading-tight text-ink-faint">
                              {nombre}
                            </div>
                          )}
                          {!item.is_available ? (
                            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[10px] text-white">
                              Guardada
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 truncate text-[11px] text-ink-soft">{nombre}</p>
                      </TransitionLink>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-10 space-y-3">
        <Link href="/armario/nueva" className="block">
          <Button fullWidth>Añadir prenda</Button>
        </Link>
        <Link href="/onboarding" className="block">
          <Button variant="secondary" fullWidth>
            Analizar más fotos
          </Button>
        </Link>
      </div>
    </Screen>
  )
}
