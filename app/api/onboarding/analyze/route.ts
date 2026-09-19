import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { analyzePendingPhotos } from '@/lib/onboarding/analyze'
import { checkRateLimit, rateLimitMessage, RATE_LIMITS } from '@/lib/security/rate-limit'
import { log } from '@/lib/observability/log'

/**
 * Dispara el análisis de las fotos pendientes.
 *
 * El cliente lanza esta petición y NO se queda mirándola: consulta el progreso
 * en `/api/onboarding/status`. Si la petición muere por el camino (red del móvil,
 * pestaña cerrada), las fotos quedan en `processing` y se puede reintentar; el
 * estado vive en la base de datos, no en esta función.
 */
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  // Control de ráfagas: el cupo mensual limita cuánto, esto limita cómo de
  // rápido. Un doble clic o un reintento mal hecho pueden lanzar varios
  // análisis seguidos, y cada uno cuesta dinero.
  const rate = await checkRateLimit(user.id, RATE_LIMITS.aiVision)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rateLimitMessage(rate) },
      { status: 429, headers: { 'retry-after': String(rate.resetInSeconds) } },
    )
  }

  const started = Date.now()
  try {
    const result = await analyzePendingPhotos(user.id)
    log.info({
      event: 'onboarding.analyze',
      userId: user.id,
      durationMs: Date.now() - started,
      photos: result.photosAnalyzed,
      created: result.itemsCreated,
      merged: result.itemsMerged,
      toConfirm: result.needsConfirmation,
    })
    return NextResponse.json(result)
  } catch (error) {
    log.error({
      event: 'onboarding.analyze-failed',
      userId: user.id,
      durationMs: Date.now() - started,
      error,
    })
    return NextResponse.json({ error: 'El análisis ha fallado.' }, { status: 500 })
  }
}
