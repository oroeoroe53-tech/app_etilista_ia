import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { analyzePendingPhotos } from '@/lib/onboarding/analyze'

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

  try {
    const result = await analyzePendingPhotos(user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/analyze] fallo inesperado:', err)
    return NextResponse.json({ error: 'El análisis ha fallado.' }, { status: 500 })
  }
}
