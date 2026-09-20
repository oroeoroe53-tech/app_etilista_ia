import Link from 'next/link'
import { demoWardrobe } from '@/lib/demo/wardrobe'
import { generateOutfits } from '@/lib/outfits/engine'
import { emptyProfile } from '@/lib/style/profile'
import { seasonOf } from '@/lib/outfits/filters'
import { nameOutfit, explainFromHighlights } from '@/lib/outfits/name'
import { describeGarment } from '@/lib/wardrobe/labels'
import { Button, PhotoSlot } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default function DemoLooks() {
  const today = new Date()
  const wardrobe = demoWardrobe(today)

  const { outfits } = generateOutfits({
    wardrobe,
    profile: emptyProfile(),
    context: { temperatureC: 18, rain: false, season: seasonOf(today), today },
    count: 3,
  })

  return (
    <div
      className="mx-auto w-full max-w-[30rem]"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="pt-5 pb-1">
        <p className="eyebrow mb-2.5">18° · Diario</p>
        <h1 className="display text-[2rem]">
          {outfits.length === 3 ? 'Tres opciones' : `${outfits.length} opciones`}
        </h1>
      </header>

      <div className="space-y-3.5 pt-3.5">
        {outfits.map((outfit, index) => (
          <article key={index} className="rounded-[24px] bg-raised p-4 shadow-card-soft">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <p className="eyebrow">Look {index + 1}</p>
              <p className="text-[11px] whitespace-nowrap text-ink-faint">
                {Math.round(outfit.score * 100)}% match
              </p>
            </div>

            <div className="flex gap-[7px]">
              {outfit.items.map((item) => (
                <PhotoSlot
                  key={item.id}
                  src={null}
                  label={describeGarment(item)}
                  className="h-24 min-w-0 flex-1 rounded-[13px]"
                />
              ))}
            </div>

            <h2 className="display mt-3.5 text-[19px] leading-[1.2]">
              {nameOutfit(outfit.items)}
            </h2>
            <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink-soft">
              {explainFromHighlights(outfit.highlights) ?? 'Compuesto con lo que hay disponible.'}
            </p>
          </article>
        ))}
      </div>

      <p className="mt-7 border-l-2 border-line pl-3.5 text-[11.5px] leading-[1.5] text-ink-soft">
        Las tres salen del mismo armario y se parecen lo justo: el motor busca
        que sean distintas entre sí, no tres variantes de la misma idea.
      </p>

      <div className="mt-6">
        <Link href="/register" className="block">
          <Button size="lg" fullWidth>
            Quiero estas tres con mi ropa
          </Button>
        </Link>
      </div>
    </div>
  )
}
