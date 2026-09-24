import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment } from '@/lib/wardrobe/normalize'
import {
  DuplicateReview,
  type DuplicateQuestion,
} from '@/components/onboarding/DuplicateReview'

export const metadata = { title: 'Revisar · Selyqo' }
export const dynamic = 'force-dynamic'

interface DetectionRow {
  id: string
  raw: { category: string; primary_color: string; fit?: string; pattern?: string }
  match_confidence: number | null
  clothing_item_id: string | null
}

interface ItemRow {
  id: string
  category: string
  primary_color: string
  fit: string | null
  pattern: string | null
  image_path: string | null
}

/**
 * Pantalla de dudas de deduplicación.
 *
 * Solo llega aquí quien tiene alguna. Si el análisis fue limpio, el onboarding
 * termina directamente en el armario.
 */
export default async function ReviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: detections } = await supabase
    .from('detected_items')
    .select('id, raw, match_confidence, clothing_item_id')
    .eq('match_status', 'needs_confirmation')
    .order('match_confidence', { ascending: false })

  const rows = (detections ?? []) as unknown as DetectionRow[]
  if (rows.length === 0) redirect('/armario')

  // Una pregunta por prenda detectada, no por aparición en cada foto.
  const seen = new Set<string>()
  const unique = rows.filter((row) => {
    const key = row.clothing_item_id ?? row.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const itemIds = unique.map((r) => r.clothing_item_id).filter((id): id is string => Boolean(id))

  const { data: items } = itemIds.length
    ? await supabase
        .from('clothing_items')
        .select('id, category, primary_color, fit, pattern, image_path')
        .in('id', itemIds)
    : { data: [] }

  const wardrobe = new Map(((items ?? []) as unknown as ItemRow[]).map((i) => [i.id, i]))

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    [...wardrobe.values()].map((i) => i.image_path).filter((p): p is string => Boolean(p)),
    user.id,
  )

  const questions: DuplicateQuestion[] = unique.map((row) => {
    const existing = row.clothing_item_id ? wardrobe.get(row.clothing_item_id) : undefined
    return {
      detectionId: row.id,
      candidate: {
        label: describeGarment(row.raw),
        // La prenda candidata todavía no tiene ficha propia: se enseña sin foto.
        imageUrl: null,
      },
      existing: {
        label: existing ? describeGarment(existing) : 'Prenda de tu armario',
        imageUrl: existing?.image_path ? (signed.get(existing.image_path) ?? null) : null,
      },
      similarity: row.match_confidence ?? 0,
    }
  })

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 pt-safe py-12">
      <DuplicateReview questions={questions} />
    </main>
  )
}
