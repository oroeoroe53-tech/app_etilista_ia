import { demoWardrobe } from '@/lib/demo/wardrobe'
import { generateOutfits } from '@/lib/outfits/engine'
import { emptyProfile } from '@/lib/style/profile'
import { seasonOf } from '@/lib/outfits/filters'
import { nameOutfit, explainFromHighlights } from '@/lib/outfits/name'
import { describeGarment } from '@/lib/wardrobe/labels'
import { TodayLook } from '@/components/home/TodayLook'
import { HeaderLight, PhotoSlot } from '@/components/ui'
import Link from 'next/link'
import { track } from '@/lib/observability/funnel'

/*
 * Se compone en cada visita, no se prerenderiza: así el look cambia con el día
 * de la semana y con la temporada, igual que el de verdad. Cuesta unos pocos
 * milisegundos de cálculo y ninguna consulta.
 */
export const dynamic = 'force-dynamic'

/** Un día de septiembre en Madrid. Fijo, porque aquí no hay a quién preguntarle. */
const DEMO_WEATHER = { temperatureC: 18, description: 'nublado', city: 'Madrid' }

export default function DemoHome() {
  track('demo_viewed')

  const today = new Date()
  const wardrobe = demoWardrobe(today)

  const { outfits } = generateOutfits({
    wardrobe,
    profile: emptyProfile(),
    context: {
      temperatureC: DEMO_WEATHER.temperatureC,
      rain: false,
      season: seasonOf(today),
      today,
    },
    count: 1,
  })

  const best = outfits[0]
  const fecha = `${today.toLocaleDateString('es-ES', { weekday: 'long' })} ${today.getDate()}`

  // Cinco prendas para la tira de abajo, las más usadas.
  const strip = [...wardrobe].sort((a, b) => b.times_worn - a.times_worn).slice(0, 5)

  const title = best ? nameOutfit(best.items) : null

  return (
    <div
      className="mx-auto w-full max-w-[30rem]"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="relative flex items-start justify-between gap-4 pt-5">
        <HeaderLight />
        <div className="relative min-w-0">
          <p className="eyebrow">
            {fecha} · {DEMO_WEATHER.city}
          </p>
          <h1 className="display mt-2.5 text-display leading-[1.05]">
            Hoy te veo
            <span className="display-italic mt-0.5 block">
              {title ? `en ${title.charAt(0).toLowerCase()}${title.slice(1)}` : 'como tú quieras'}
            </span>
          </h1>
        </div>
        <p className="relative shrink-0 pt-1 text-right text-small leading-[1.5] text-ink-soft">
          {DEMO_WEATHER.temperatureC}°
          <span className="block">{DEMO_WEATHER.description}</span>
        </p>
      </header>

      {best ? (
        <TodayLook
          href="/register"
          look={{
            outfitId: 'demo',
            title: title ?? 'Un look',
            explanation: explainFromHighlights(best.highlights),
            match: Math.round(best.score * 100),
            items: best.items.map((item) => ({
              id: item.id,
              name: describeGarment(item),
              imageUrl: null,
            })),
          }}
        />
      ) : null}

      <Link
        href="/demo/looks"
        className="mt-3.5 flex items-center justify-between gap-4 rounded-[18px] border border-line px-4 py-[15px]"
      >
        <span className="min-w-0">
          <span className="eyebrow block">Sin prisa</span>
          <span className="display mt-1 block text-lead">Ver otras tres opciones</span>
        </span>
        <span aria-hidden className="shrink-0 text-small text-ink-faint">
          →
        </span>
      </Link>

      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="display text-lead">Este armario · {wardrobe.length}</h2>
          <Link href="/demo/armario" className="text-micro whitespace-nowrap text-ink-faint">
            ver todo
          </Link>
        </div>
        {/*
          La tira sube de 56×70 a 94×125.

          A cincuenta y seis píxeles de ancho una prenda no es una prenda: es
          una muestra de color. Esta tira existe para reconocer lo que tienes de
          un vistazo, y para eso hay que verle la forma.
        */}
        <ul className="no-scrollbar bleed-row flex gap-[9px] overflow-x-auto pb-1">
          {strip.map((item) => (
            <li key={item.id} className="shrink-0">
              <PhotoSlot
                src={null}
                label={describeGarment(item)}
                className="h-[125px] w-[94px] rounded-[14px]"
              />
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-7 border-l-2 border-line pl-3.5 text-small leading-[1.5] text-ink-soft">
        Este look no está elegido a mano: lo ha compuesto el mismo motor que usa
        la aplicación, con las prendas de este armario, para hoy y para 18 grados.
      </p>
    </div>
  )
}
