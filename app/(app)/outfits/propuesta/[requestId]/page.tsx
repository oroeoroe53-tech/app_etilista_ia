import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment } from '@/lib/wardrobe/labels'
import { OutfitCard, type OutfitView } from '@/components/outfits/OutfitCard'
import { Screen, Button } from '@/components/ui'

export const metadata = { title: 'Tus looks · Estilista' }
export const dynamic = 'force-dynamic'

interface OutfitRow {
  id: string
  explanation: string | null
  context: {
    position?: number
    occasion?: string | null
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

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: outfitRows } = await supabase
    .from('outfits')
    .select('id, explanation, context')
    .eq('context->>request_id', requestId)
    .order('created_at', { ascending: true })

  const outfits = (outfitRows ?? []) as unknown as OutfitRow[]
  if (outfits.length === 0) notFound()

  const { data: links } = await supabase
    .from('outfit_items')
    .select('outfit_id, clothing_item_id')
    .in('outfit_id', outfits.map((o) => o.id))

  const itemIds = [
    ...new Set(
      ((links ?? []) as Array<{ clothing_item_id: string }>).map((l) => l.clothing_item_id),
    ),
  ]

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
  )

  const byOutfit = new Map<string, string[]>()
  for (const link of (links ?? []) as Array<{ outfit_id: string; clothing_item_id: string }>) {
    byOutfit.set(link.outfit_id, [
      ...(byOutfit.get(link.outfit_id) ?? []),
      link.clothing_item_id,
    ])
  }

  const views: OutfitView[] = outfits
    .sort((a, b) => (a.context?.position ?? 0) - (b.context?.position ?? 0))
    .map((outfit) => ({
      id: outfit.id,
      explanation: outfit.explanation,
      items: (byOutfit.get(outfit.id) ?? [])
        .map((id) => items.get(id))
        .filter((item): item is ItemRow => Boolean(item))
        .map((item) => ({
          id: item.id,
          name: describeGarment(item),
          imageUrl: item.image_path ? (signed.get(item.image_path) ?? null) : null,
        })),
    }))

  const context = outfits[0]?.context
  const contextLine = [
    context?.occasion ? occasionText(context.occasion) : null,
    context?.temperature_c != null ? `${context.temperature_c}°` : null,
    context?.rain ? 'con lluvia' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Screen>
      <header className="pt-8 pb-8">
        <p className="eyebrow mb-2">{contextLine || 'Para hoy'}</p>
        <h1 className="display text-4xl">Tres opciones</h1>
      </header>

      <div className="space-y-8">
        {views.map((outfit, index) => (
          <OutfitCard key={outfit.id} outfit={outfit} index={index} />
        ))}
      </div>

      <div className="mt-10 space-y-3">
        <Link href="/outfits/que-me-pongo" className="block">
          <Button variant="secondary" fullWidth>
            Enséñame otras
          </Button>
        </Link>
      </div>
    </Screen>
  )
}

function occasionText(value: string): string {
  const LABELS: Record<string, string> = {
    work: 'Trabajo',
    casual: 'Diario',
    date: 'Cita',
    sport: 'Deporte',
    party: 'Fiesta',
    formal_event: 'Evento formal',
    travel: 'Viaje',
    home: 'Casa',
  }
  return LABELS[value] ?? value
}
