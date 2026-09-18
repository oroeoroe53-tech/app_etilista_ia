import { NextResponse } from 'next/server'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

/**
 * Progreso del análisis.
 *
 * Es lo que consulta la pantalla de espera. Devuelve el recuento por estado,
 * no las filas: la respuesta es diminuta y se puede pedir cada dos segundos sin
 * coste apreciable.
 */
export const dynamic = 'force-dynamic'

type Status = 'pending' | 'processing' | 'done' | 'failed' | 'skipped'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })

  const supabase = await createClient()

  const [{ data: photos }, { count: itemCount }, { count: pendingReview }] = await Promise.all([
    supabase.from('outfit_photos').select('analysis_status, analysis_error'),
    supabase
      .from('clothing_items')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null),
    supabase
      .from('detected_items')
      .select('id', { count: 'exact', head: true })
      .eq('match_status', 'needs_confirmation'),
  ])

  const rows = (photos ?? []) as Array<{ analysis_status: Status; analysis_error: string | null }>

  const counts: Record<Status, number> = {
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    skipped: 0,
  }
  for (const row of rows) counts[row.analysis_status]++

  const total = rows.length
  const settled = counts.done + counts.failed + counts.skipped

  return NextResponse.json({
    total,
    counts,
    finished: total > 0 && counts.pending === 0 && counts.processing === 0,
    progress: total === 0 ? 0 : Math.round((settled / total) * 100),
    itemCount: itemCount ?? 0,
    pendingReview: pendingReview ?? 0,
    error: rows.find((r) => r.analysis_error)?.analysis_error ?? null,
  })
}
