'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEntitlement } from '@/lib/subscriptions/entitlements'
import { ONBOARDING_PHOTOS, UPLOAD_RULES } from '@/lib/subscriptions/plans'
import { getPlan } from '@/lib/subscriptions/entitlements'
import { pathBelongsTo } from '@/lib/storage/paths'
import { track } from '@/lib/observability/funnel'
import { purgeOriginalPhotos } from '@/lib/onboarding/retention'

/**
 * Acciones del onboarding.
 *
 * La subida del archivo la hace el navegador directamente contra Storage (con la
 * clave pública, limitada por RLS): así el archivo no pasa por el servidor de
 * Next, que ni tiene que recibirlo ni reenviarlo.
 *
 * Lo que sí pasa por aquí es el REGISTRO de esa subida, porque es donde se
 * comprueban los límites y la propiedad de la ruta. Nunca se confía en que el
 * cliente mande una ruta honrada.
 */

const registerSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(30),
})

export interface RegisterResult {
  ok: boolean
  error?: string
  count?: number
}

/** Registra en la base de datos las fotos que el navegador ya ha subido. */
export async function registerUploadedPhotos(paths: string[]): Promise<RegisterResult> {
  const user = await requireUser()

  const parsed = registerSchema.safeParse({ paths })
  if (!parsed.success) return { ok: false, error: 'Selección de fotos no válida.' }

  // Defensa además del RLS: la ruta tiene que empezar por el uid del usuario.
  const ajenas = parsed.data.paths.filter((p) => !pathBelongsTo(p, user.id))
  if (ajenas.length > 0) return { ok: false, error: 'Ruta de archivo no válida.' }

  const plan = await getPlan(user.id)
  const { max } = ONBOARDING_PHOTOS[plan]
  if (parsed.data.paths.length > max) {
    return { ok: false, error: `En tu plan puedes analizar hasta ${max} fotos de una vez.` }
  }

  const permiso = await checkEntitlement(user.id, 'analyze_outfit')
  if (!permiso.allowed) {
    return {
      ok: false,
      error:
        permiso.reason === 'not_in_plan'
          ? 'Tu plan no incluye el análisis de fotos.'
          : `Has agotado los análisis de este mes (${permiso.used}/${permiso.limit}).`,
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('outfit_photos').insert(
    parsed.data.paths.map((path) => ({
      user_id: user.id,
      storage_path: path,
      analysis_status: 'pending' as const,
    })),
  )

  if (error) {
    console.error('[onboarding] no se pudieron registrar las fotos:', error.message)
    return { ok: false, error: 'No hemos podido guardar las fotos. Inténtalo de nuevo.' }
  }

  await supabase.from('profiles').update({ onboarding_stage: 'photos_uploaded' }).eq('id', user.id)
  track('photos_uploaded', user.id)

  revalidatePath('/onboarding')
  return { ok: true, count: parsed.data.paths.length }
}

/**
 * Resuelve una duda de deduplicación.
 *
 * `same: true`  → era la misma prenda que ya tenía: no se crea nada.
 * `same: false` → es una prenda distinta: se crea a partir de la lectura guardada.
 */
export async function resolveDuplicate(detectionId: string, same: boolean) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from('detected_items')
    .select('id, raw, clothing_item_id')
    .eq('id', detectionId)
    .eq('user_id', user.id)
    .maybeSingle()

  const detection = data as { id: string; raw: Record<string, unknown> } | null
  if (!detection) return { ok: false, error: 'No encontrado.' }

  if (same) {
    await supabase
      .from('detected_items')
      .update({ match_status: 'auto_merged' })
      .eq('id', detectionId)
  } else {
    const admin = createAdminClient()
    const { toClothingItem } = await import('@/lib/wardrobe/normalize')
    const garment = detection.raw as never

    const { data: created } = await admin
      .from('clothing_items')
      .insert(toClothingItem(garment, user.id))
      .select('id')
      .single()

    await supabase
      .from('detected_items')
      .update({
        match_status: 'new_item',
        clothing_item_id: (created as { id: string } | null)?.id ?? null,
      })
      .eq('id', detectionId)
  }

  revalidatePath('/onboarding/revisar')
  revalidatePath('/armario')
  return { ok: true }
}

/** Cierra el onboarding. */
export async function finishOnboarding() {
  const user = await requireUser()
  const supabase = await createClient()

  await supabase.from('profiles').update({ onboarding_stage: 'completed' }).eq('id', user.id)

  /*
   * Las fotos originales ya no hacen falta: el armario está montado y de cada
   * prenda queda su recorte. Se espera a que termine —son unos milisegundos y
   * quien acaba de pulsar "listo" no nota la diferencia— para que el borrado
   * ocurra de verdad y no quede colgando de una promesa sin dueño.
   */
  await purgeOriginalPhotos(user.id).catch(() => undefined)

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Límites de subida que necesita el cliente, sin exponer el resto del plan. */
export async function getUploadLimits() {
  const user = await requireUser()
  const plan = await getPlan(user.id)
  return {
    ...ONBOARDING_PHOTOS[plan],
    maxBytes: UPLOAD_RULES.maxBytes,
    accepted: UPLOAD_RULES.acceptedMimeTypes,
  }
}
