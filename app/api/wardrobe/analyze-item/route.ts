import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ai } from '@/lib/ai/router'
import { checkEntitlement, consumeEntitlement } from '@/lib/subscriptions/entitlements'
import { BUCKETS, pathBelongsTo } from '@/lib/storage/paths'
import { UPLOAD_RULES } from '@/lib/subscriptions/plans'
import sharp from 'sharp'

/**
 * Rellena el formulario de una prenda a partir de su foto.
 *
 * Es un atajo, no un requisito: se puede crear una prenda entera a mano sin
 * gastar una llamada. Por eso el cupo solo se descuenta si el análisis funciona.
 */
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { path?: string } | null
  const path = body?.path

  if (!path || !pathBelongsTo(path, user.id)) {
    return NextResponse.json({ error: 'Imagen no válida.' }, { status: 400 })
  }

  const permiso = await checkEntitlement(user.id, 'analyze_outfit')
  if (!permiso.allowed) {
    return NextResponse.json(
      {
        error:
          permiso.reason === 'not_in_plan'
            ? 'Tu plan no incluye el análisis de fotos.'
            : `Has agotado los análisis de este mes (${permiso.used}/${permiso.limit}).`,
      },
      { status: 403 },
    )
  }

  try {
    const admin = createAdminClient()
    const { data: file, error } = await admin.storage.from(BUCKETS.clothing).download(path)
    if (error || !file) {
      return NextResponse.json({ error: 'No hemos podido leer la imagen.' }, { status: 400 })
    }

    const optimized = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(UPLOAD_RULES.aiMaxEdge, UPLOAD_RULES.aiMaxEdge, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer()

    const { data: garment } = await ai.vision.analyzeSingleItem(
      { data: optimized.toString('base64'), mimeType: 'image/jpeg', index: 0 },
      { userId: user.id },
    )

    await consumeEntitlement(user.id, 'analyze_outfit')

    return NextResponse.json({ garment })
  } catch (err) {
    console.error('[api/analyze-item] fallo:', err)
    // No se descuenta cupo: el usuario rellena a mano y no ha perdido nada.
    return NextResponse.json(
      { error: 'No hemos podido analizar la foto. Rellena los datos a mano.' },
      { status: 502 },
    )
  }
}
