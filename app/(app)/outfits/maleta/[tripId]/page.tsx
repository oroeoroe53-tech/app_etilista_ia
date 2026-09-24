import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment, LAYER_LABELS } from '@/lib/wardrobe/labels'
import { layerOf, type Category, type Layer } from '@/lib/wardrobe/taxonomy'
import { Screen, Button } from '@/components/ui'

export const metadata = { title: 'Tu maleta · Estilista' }
export const dynamic = 'force-dynamic'

interface OutfitRow {
  id: string
  context: {
    position?: number
    destination?: string | null
    temperature_c?: number | null
    rain?: boolean
  } | null
}

interface ItemRow {
  id: string
  category: string
  primary_color: string
  fit: string | null
  pattern: string | null
  image_path: string | null
}

const LAYER_ORDER: Layer[] = ['outer', 'top', 'bottom', 'full_body', 'footwear', 'accessory']

/**
 * La maleta.
 *
 * Dos vistas del mismo viaje. Primero **qué meter** —que es lo que se necesita
 * la noche antes, con la maleta abierta— y debajo qué se pone cada día.
 *
 * Ese orden importa: la lista de la maleta es la respuesta a la pregunta; los
 * días son la justificación.
 */
export default async function TripResultPage({
  params,
}: {
  params: Promise<{ tripId: string }>
}) {
  const { tripId } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: outfitRows } = await supabase
    .from('outfits')
    .select('id, context')
    .eq('context->>trip_id', tripId)
    .order('created_at', { ascending: true })

  const outfits = (outfitRows ?? []) as unknown as OutfitRow[]
  if (outfits.length === 0) notFound()

  const { data: links } = await supabase
    .from('outfit_items')
    .select('outfit_id, clothing_item_id')
    .in('outfit_id', outfits.map((o) => o.id))

  const linkRows = (links ?? []) as Array<{ outfit_id: string; clothing_item_id: string }>
  const itemIds = [...new Set(linkRows.map((l) => l.clothing_item_id))]

  const { data: itemRows } = itemIds.length
    ? await supabase
        .from('clothing_items')
        .select('id, category, primary_color, fit, pattern, image_path')
        .in('id', itemIds)
    : { data: [] }

  const items = new Map(((itemRows ?? []) as unknown as ItemRow[]).map((i) => [i.id, i]))

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    [...items.values()].map((i) => i.image_path).filter((p): p is string => Boolean(p)),
    user.id,
  )

  const byOutfit = new Map<string, string[]>()
  for (const link of linkRows) {
    byOutfit.set(link.outfit_id, [...(byOutfit.get(link.outfit_id) ?? []), link.clothing_item_id])
  }

  // Cuántos días usa cada prenda: lo que justifica llevarla.
  const usage = new Map<string, number>()
  for (const ids of byOutfit.values()) {
    for (const id of ids) usage.set(id, (usage.get(id) ?? 0) + 1)
  }

  const packed = [...items.values()]
  const grouped = new Map<Layer, ItemRow[]>()
  for (const item of packed) {
    const layer = layerOf(item.category as Category)
    grouped.set(layer, [...(grouped.get(layer) ?? []), item])
  }

  const ordered = [...outfits].sort(
    (a, b) => (a.context?.position ?? 0) - (b.context?.position ?? 0),
  )
  const destino = outfits[0]?.context?.destination

  return (
    <Screen>
      <header className="pt-8 pb-8">
        <p className="eyebrow mb-2">
          {destino ? destino.toUpperCase() : 'TU VIAJE'} · {ordered.length}{' '}
          {ordered.length === 1 ? 'DÍA' : 'DÍAS'}
        </p>
        <h1 className="display text-[2rem]">La maleta</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {packed.length} prendas para {ordered.length}{' '}
          {ordered.length === 1 ? 'día' : 'días'}. Las que se repiten hacen el trabajo
          de varias.
        </p>
      </header>

      {/* --- Qué meter ---------------------------------------------------- */}
      <section className="mb-12">
        <h2 className="eyebrow mb-4">Qué meter</h2>

        <div className="space-y-6">
          {LAYER_ORDER.filter((layer) => grouped.has(layer)).map((layer) => (
            <div key={layer}>
              <p className="folio mb-2">{(LAYER_LABELS[layer] ?? layer).toUpperCase()}</p>
              <ul className="space-y-2">
                {grouped.get(layer)!.map((item) => {
                  const url = item.image_path ? signed.get(item.image_path) : null
                  const veces = usage.get(item.id) ?? 1
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/armario/${item.id}`}
                        className="flex items-center gap-3 border-b border-line pb-2"
                      >
                        {url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={url}
                            alt=""
                            loading="lazy"
                            className="garment-photo h-12 w-10 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="h-12 w-10 shrink-0 rounded-md bg-sunken" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {describeGarment(item)}
                        </span>
                        {veces > 1 ? (
                          <span className="folio shrink-0">{veces} días</span>
                        ) : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* --- Día a día ----------------------------------------------------- */}
      <section>
        <h2 className="eyebrow mb-4">Día a día</h2>

        <div className="space-y-8">
          {ordered.map((outfit, index) => {
            const ids = byOutfit.get(outfit.id) ?? []
            const temp = outfit.context?.temperature_c
            const rain = outfit.context?.rain

            return (
              <article key={outfit.id} className="border-b border-line pb-6 last:border-0">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="folio">
                    DÍA {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {temp != null ? `${temp}°` : ''}
                    {rain ? ' · lluvia' : ''}
                  </span>
                </div>

                <ul className="flex gap-2 overflow-x-auto no-scrollbar">
                  {ids.map((id) => {
                    const item = items.get(id)
                    if (!item) return null
                    const url = item.image_path ? signed.get(item.image_path) : null
                    return (
                      <li key={id} className="w-20 shrink-0">
                        {url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={url}
                            alt={describeGarment(item)}
                            loading="lazy"
                            className="garment-photo aspect-3/4 w-full rounded-lg border border-line object-cover"
                          />
                        ) : (
                          <div className="flex aspect-3/4 w-full items-center justify-center rounded-lg border border-line bg-sunken px-1 text-center text-micro leading-tight text-ink-faint">
                            {describeGarment(item)}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </article>
            )
          })}
        </div>
      </section>

      <div className="mt-10">
        <Link href="/outfits/maleta" className="block">
          <Button variant="secondary" fullWidth>
            Planear otro viaje
          </Button>
        </Link>
      </div>
    </Screen>
  )
}
