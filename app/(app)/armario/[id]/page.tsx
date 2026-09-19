import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signOne } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment, MATERIAL_LABELS, SEASON_LABELS, STYLE_LABELS, FORMALITY_LABELS, WARMTH_LABELS, CONDITION_LABELS, colorLabel } from '@/lib/wardrobe/labels'
import type { Material, Season, Style } from '@/lib/wardrobe/taxonomy'
import { Screen } from '@/components/ui'
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

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data } = await supabase
    .from('clothing_items')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  const item = data as ItemRow | null
  if (!item) notFound()

  const imageUrl = item.image_path
    ? await signOne(supabase, BUCKETS.clothing, item.image_path)
    : null

  const nombre = describeGarment(item)
  const dudosa = !item.user_verified && (item.ai_confidence ?? 1) < 0.6

  return (
    <Screen>
      <div className="pt-6 pb-4">
        <Link href="/armario" className="text-sm text-ink-soft">
          ← Armario
        </Link>
      </div>

      {imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl}
          alt={nombre}
          style={{ viewTransitionName: 'garment' }}
          className="garment-photo mb-6 aspect-3/4 w-full rounded-[var(--radius-card)] border border-line object-cover"
        />
      ) : (
        <div className="mb-6 flex aspect-3/4 w-full items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line bg-sunken text-sm text-ink-faint">
          Sin foto
        </div>
      )}

      <header className="mb-6">
        <h1 className="display text-3xl">{nombre}</h1>
        {item.subcategory ? (
          <p className="mt-1 text-sm text-ink-soft">{item.subcategory}</p>
        ) : null}
        {!item.is_available ? (
          <p className="mt-3 inline-block rounded-full bg-sunken px-3 py-1 text-xs text-ink-soft">
            Guardada · no la usaré en las propuestas
          </p>
        ) : null}
      </header>

      {dudosa ? (
        <p className="mb-6 rounded-2xl bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-soft">
          Esta no la vi con claridad en tu foto. Échale un ojo y corrígeme si hace falta.
        </p>
      ) : null}

      <dl className="mb-8 space-y-3 text-sm">
        <Row label="Color">
          {[item.primary_color, ...item.secondary_colors].map(colorLabel).join(' · ')}
        </Row>
        <Row label="Tejido">{MATERIAL_LABELS[item.material as Material] ?? item.material}</Row>
        <Row label="Temporadas">
          {item.seasons.map((s) => SEASON_LABELS[s as Season] ?? s).join(' · ') || '—'}
        </Row>
        <Row label="Estilo">
          {item.styles.map((s) => STYLE_LABELS[s as Style] ?? s).join(' · ') || '—'}
        </Row>
        <Row label="Arreglada">{FORMALITY_LABELS[item.formality]}</Row>
        <Row label="Abrigo">{WARMTH_LABELS[item.warmth]}</Row>
        <Row label="Estado">{CONDITION_LABELS[item.condition] ?? item.condition}</Row>
        <Row label="Veces puesta">
          {item.times_worn === 0 ? 'Todavía ninguna' : item.times_worn}
        </Row>
      </dl>

      {item.notes ? (
        <div className="mb-8">
          <p className="eyebrow mb-2">Notas</p>
          <p className="text-sm leading-relaxed text-ink-soft">{item.notes}</p>
        </div>
      ) : null}

      <ItemActions itemId={item.id} available={item.is_available} name={nombre} />
    </Screen>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line pb-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  )
}
