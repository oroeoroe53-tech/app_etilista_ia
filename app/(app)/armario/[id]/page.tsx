import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import {
  describeGarment,
  MATERIAL_LABELS,
  SEASON_LABELS,
  STYLE_LABELS,
  WARMTH_LABELS,
  FORMALITY_LABELS,
  LAYER_LABELS,
  colorLabel,
} from '@/lib/wardrobe/labels'
import { layerOf, type Category, type Material, type Season, type Style } from '@/lib/wardrobe/taxonomy'
import { findPairings, type PairCandidate } from '@/lib/wardrobe/pairs'
import { Button, PhotoSlot } from '@/components/ui'
import { ItemActions } from '@/components/wardrobe/ItemActions'

export const dynamic = 'force-dynamic'

interface ItemRow {
  id: string
  category: string
  subcategory: string | null
  primary_color: string
  secondary_colors: string[]
  pattern: string
  fit: string
  material: string
  styles: string[]
  seasons: string[]
  formality: number
  warmth: number
  condition: string
  is_available: boolean
  notes: string | null
  image_path: string | null
  user_verified: boolean
  ai_confidence: number | null
  times_worn: number
  last_worn_at: string | null
}

/**
 * Ficha de una prenda.
 *
 * La foto va a sangre y ocupa media pantalla. Es lo contrario de una ficha de
 * inventario: lo primero es la prenda, y los datos —que los puso una máquina y
 * pueden estar mal— van debajo, en letra pequeña y corregibles.
 */
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data }, { data: wardrobeRows }] = await Promise.all([
    supabase.from('clothing_items').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    supabase
      .from('clothing_items')
      .select('id, category, primary_color, secondary_colors, styles, formality, fit, pattern, image_path, is_available')
      .is('deleted_at', null),
  ])

  const item = data as ItemRow | null
  if (!item) notFound()

  const nombre = describeGarment(item)
  const dudosa = !item.user_verified && (item.ai_confidence ?? 1) < 0.6

  const combina = findPairings(item as PairCandidate, (wardrobeRows ?? []) as PairCandidate[])

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    [item.image_path, ...combina.map((c) => c.image_path ?? null)].filter(
      (p): p is string => Boolean(p),
    ),
    user.id,
  )

  const imageUrl = item.image_path ? (signed.get(item.image_path) ?? null) : null

  const capa = LAYER_LABELS[layerOf(item.category as Category)] ?? item.category

  // Rasgos, en el orden en que alguien los diría en voz alta.
  const tags = [
    MATERIAL_LABELS[item.material as Material],
    WARMTH_LABELS[item.warmth] ?? null,
    item.seasons.length === 4
      ? 'todo el año'
      : item.seasons.map((s) => SEASON_LABELS[s as Season] ?? s).join(' · '),
    ...item.styles.slice(0, 2).map((s) => STYLE_LABELS[s as Style] ?? s),
  ].filter((tag): tag is string => Boolean(tag) && tag !== 'Sin determinar')

  return (
    <div className="pb-nav">
      {/* --- Foto a sangre ------------------------------------------------ */}
      <div className="relative">
        <PhotoSlot
          src={imageUrl}
          label={nombre}
          showLabel={false}
          className="h-[400px] w-full"
          style={imageUrl ? { viewTransitionName: 'garment' } : undefined}
        />

        <div className="absolute top-0 left-0 pt-safe">
          <Link
            href="/armario"
            className="m-4 inline-block rounded-full bg-[rgba(255,253,248,0.9)] px-3.5 py-2 text-small text-ink backdrop-blur-sm"
          >
            ← armario
          </Link>
        </div>
      </div>

      {/* --- Cuerpo -------------------------------------------------------- */}
      <div
        className="mx-auto w-full max-w-[30rem] pt-5 pb-7"
        style={{ paddingInline: 'var(--screen-gutter)' }}
      >
        <p className="eyebrow">
          {capa} · {colorLabel(item.primary_color)}
        </p>
        <h1 className="display mt-2 text-display">{nombre}</h1>
        {item.subcategory ? (
          <p className="mt-1 text-small text-ink-soft">{item.subcategory}</p>
        ) : null}

        {tags.length > 0 ? (
          <ul className="mt-3.5 flex flex-wrap gap-[6px]">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-line px-3 py-[7px] text-small text-ink-soft"
              >
                {tag.toLowerCase()}
              </li>
            ))}
          </ul>
        ) : null}

        {!item.is_available ? (
          <p className="mt-3.5 inline-block rounded-full border border-line px-3 py-[7px] text-small text-ink-soft">
            Guardada · no la uso en las propuestas
          </p>
        ) : null}

        {dudosa ? (
          <p className="mt-4 rounded-[18px] border border-line px-4 py-3 text-small leading-[1.5] text-ink-soft">
            Esta no la vi con claridad en tu foto. Échale un ojo y corrígeme si hace falta.
          </p>
        ) : null}

        {/* --- Dos cifras -------------------------------------------------
            El diseño pide aquí "14 looks posibles con ella". Ese número
            exigiría montar todas las combinaciones del armario cada vez que se
            abre una prenda, y sobre todo no significaría gran cosa: contaría
            conjuntos, no conjuntos buenos. En su lugar van dos datos que la
            aplicación sí sabe con certeza. */}
        <div className="mt-5 flex gap-2.5">
          <Stat
            value={item.times_worn === 0 ? '—' : String(item.times_worn)}
            caption={item.times_worn === 1 ? 'vez que te la has puesto' : 'veces que te la has puesto'}
          />
          <Stat
            value={FORMALITY_LABELS[item.formality] ?? '—'}
            caption="es el registro en el que la uso"
            small
          />
        </div>

        {/* --- Combina bien con -------------------------------------------- */}
        {combina.length > 0 ? (
          <section className="mt-7">
            <h2 className="eyebrow mb-3">Combina bien con</h2>
            <ul className="no-scrollbar bleed-row flex gap-[7px] overflow-x-auto pb-1">
              {combina.map((other) => {
                const otherName = describeGarment(other as never)
                return (
                  <li key={other.id} className="shrink-0">
                    <Link href={`/armario/${other.id}`} className="block">
                      <PhotoSlot
                        src={other.image_path ? (signed.get(other.image_path) ?? null) : null}
                        label={otherName}
                        showLabel={false}
                        className="h-20 w-16 rounded-xl"
                      />
                      <p className="mt-1.5 w-16 truncate text-micro text-ink-faint">
                        {otherName}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {item.notes ? (
          <div className="mt-7">
            <p className="eyebrow mb-2">Notas</p>
            <p className="text-small leading-[1.5] text-ink-soft">{item.notes}</p>
          </div>
        ) : null}

        {/* --- Acciones ----------------------------------------------------- */}
        <div className="mt-7 flex gap-2.5">
          <Link href="/outfits/que-me-pongo" className="flex-1">
            <Button fullWidth>Montar look con esto</Button>
          </Link>
          <Link href={`/armario/${item.id}/editar`}>
            <Button variant="secondary">Editar</Button>
          </Link>
        </div>

        <div className="mt-5">
          <ItemActions itemId={item.id} available={item.is_available} name={nombre} />
        </div>
      </div>
    </div>
  )
}

/** Una cifra grande con su explicación debajo, en dos líneas. */
function Stat({
  value,
  caption,
  small,
}: {
  value: string
  caption: string
  small?: boolean
}) {
  return (
    <div className="flex-1 rounded-[18px] border border-line p-3.5">
      <p className={`display ${small ? 'text-lead' : 'text-display-s'} leading-none`}>{value}</p>
      <p className="mt-2 text-micro leading-[1.35] text-ink-faint">{caption}</p>
    </div>
  )
}
