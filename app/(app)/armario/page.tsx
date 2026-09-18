import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment } from '@/lib/wardrobe/normalize'
import { layerOf, type Category } from '@/lib/wardrobe/taxonomy'
import { Screen, PageTitle, EmptyState, Button } from '@/components/ui'

export const dynamic = 'force-dynamic'

interface ItemRow {
  id: string
  category: string
  primary_color: string
  fit: string | null
  pattern: string | null
  image_path: string | null
  user_verified: boolean
  ai_confidence: number | null
}

const LAYER_LABELS: Record<string, string> = {
  top: 'Arriba',
  bottom: 'Abajo',
  outer: 'Abrigo',
  full_body: 'Enteros',
  footwear: 'Calzado',
  accessory: 'Accesorios',
}

const LAYER_ORDER = ['top', 'bottom', 'outer', 'full_body', 'footwear', 'accessory']

/**
 * Armario.
 *
 * Agrupado por capa y no por categoría suelta: así en un móvil se ve de un
 * vistazo lo que hay arriba, abajo y de abrigo, que es como la gente piensa al
 * vestirse. La edición y los filtros llegan en la Fase 3.
 */
export default async function WardrobePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data } = await supabase
    .from('clothing_items')
    .select('id, category, primary_color, fit, pattern, image_path, user_verified, ai_confidence')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const items = (data ?? []) as unknown as ItemRow[]

  if (items.length === 0) {
    return (
      <Screen>
        <PageTitle eyebrow="Lo que tienes" title="Armario" />
        <EmptyState
          title="Todavía está vacío"
          body="Sube unas cuantas fotos de looks que ya lleves y crearé tu armario a partir de ellas."
          action={
            <Link href="/onboarding">
              <Button>Enséñame cómo vistes</Button>
            </Link>
          }
        />
      </Screen>
    )
  }

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    items.map((i) => i.image_path).filter((p): p is string => Boolean(p)),
  )

  const grouped = new Map<string, ItemRow[]>()
  for (const item of items) {
    const layer = layerOf(item.category as Category) ?? 'accessory'
    const list = grouped.get(layer) ?? []
    list.push(item)
    grouped.set(layer, list)
  }

  const porRevisar = items.filter((i) => !i.user_verified && (i.ai_confidence ?? 1) < 0.6).length

  return (
    <Screen>
      <PageTitle eyebrow={`${items.length} prendas`} title="Armario" />

      {porRevisar > 0 ? (
        <p className="mb-6 rounded-2xl bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-soft">
          {porRevisar === 1
            ? 'Hay una prenda que no vi con claridad. Échale un vistazo cuando puedas.'
            : `Hay ${porRevisar} prendas que no vi con claridad. Échales un vistazo cuando puedas.`}
        </p>
      ) : null}

      <div className="space-y-8">
        {LAYER_ORDER.filter((layer) => grouped.has(layer)).map((layer) => (
          <section key={layer}>
            <h2 className="eyebrow mb-3">{LAYER_LABELS[layer] ?? layer}</h2>
            <ul className="grid grid-cols-3 gap-2">
              {grouped.get(layer)!.map((item) => {
                const url = item.image_path ? signed.get(item.image_path) : null
                return (
                  <li key={item.id}>
                    <div className="relative overflow-hidden rounded-2xl border border-line bg-sunken">
                      {url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={url}
                          alt={describeGarment(item)}
                          loading="lazy"
                          className="aspect-3/4 w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-3/4 w-full items-center justify-center px-2 text-center text-[10px] leading-tight text-ink-faint">
                          {describeGarment(item)}
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-[11px] text-ink-soft">
                      {describeGarment(item)}
                    </p>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-10">
        <Link href="/onboarding">
          <Button variant="secondary" fullWidth>
            Añadir más fotos
          </Button>
        </Link>
      </div>
    </Screen>
  )
}
