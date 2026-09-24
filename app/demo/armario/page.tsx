import { demoWardrobe } from '@/lib/demo/wardrobe'
import { describeGarment, LAYER_LABELS } from '@/lib/wardrobe/labels'
import { layerOf, type Layer } from '@/lib/wardrobe/taxonomy'
import { PageTitle, PhotoSlot } from '@/components/ui'

export const dynamic = 'force-dynamic'

const LAYER_ORDER: Layer[] = ['top', 'bottom', 'outer', 'full_body', 'footwear', 'accessory']

export default function DemoWardrobe() {
  const wardrobe = demoWardrobe()

  const grouped = new Map<Layer, typeof wardrobe>()
  for (const item of wardrobe) {
    const layer = layerOf(item.category) ?? 'accessory'
    grouped.set(layer, [...(grouped.get(layer) ?? []), item])
  }

  const capas = LAYER_ORDER.filter((layer) => grouped.has(layer))

  return (
    <div
      className="mx-auto w-full max-w-[30rem]"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <PageTitle
        eyebrow={`${wardrobe.length} prendas · ${capas.length} categorías`}
        title="Armario"
      />

      <div className="space-y-7">
        {capas.map((layer) => {
          const items = grouped.get(layer)!
          return (
            <section key={layer}>
              <div className="mb-2.5 flex items-baseline justify-between gap-4">
                <h2 className="eyebrow">{LAYER_LABELS[layer] ?? layer}</h2>
                <span className="text-small text-ink-faint">
                  {items.length} {items.length === 1 ? 'prenda' : 'prendas'}
                </span>
              </div>
              <div className="rule mb-3" />

              <ul className="grid grid-cols-3 gap-[9px]">
                {items.map((item) => {
                  const nombre = describeGarment(item)
                  return (
                    <li key={item.id}>
                      <PhotoSlot
                        src={null}
                        label={nombre}
                        className="h-[118px] w-full rounded-[14px]"
                      />
                      <p className="mt-1.5 line-clamp-2 text-small leading-[1.3] text-ink">
                        {nombre}
                      </p>
                      <p className="text-micro leading-[1.3] text-ink-faint">
                        {item.times_worn === 0
                          ? 'sin estrenar'
                          : `${item.times_worn} ${item.times_worn === 1 ? 'uso' : 'usos'}`}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <p className="mt-8 border-l-2 border-line pl-3.5 text-small leading-[1.5] text-ink-soft">
        Un armario así no se teclea prenda a prenda: sale de cinco o seis fotos de
        looks que ya llevas puestos. De eso se encarga la aplicación.
      </p>
    </div>
  )
}
