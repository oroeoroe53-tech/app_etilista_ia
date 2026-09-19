'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEntitlement, consumeEntitlement } from '@/lib/subscriptions/entitlements'
import { rebuildStyleProfile } from '@/lib/style/rebuild'
import { outfitSignature } from '@/lib/outfits/deck'
import { layerOf, type Category } from '@/lib/wardrobe/taxonomy'

/**
 * Registro del swipe.
 *
 * El look se guarda **en este momento**, no al generar la baraja: así no se
 * escriben doce filas por cada baraja que alguien abandone a la segunda carta.
 */

const REASONS = [
  'color', 'fit', 'item', 'too_formal', 'too_casual', 'not_my_style', 'other',
] as const

const swipeSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(8),
  reaction: z.enum(['dislike', 'like', 'love', 'skip']),
  reason: z.enum(REASONS).nullable().optional(),
})

export interface SwipeResult {
  ok: boolean
  error?: string
  /** Cuántas valoraciones quedan hoy. */
  remaining?: number
}

/**
 * Cada cuántas valoraciones se recalcula el perfil.
 *
 * Hacerlo en cada deslizamiento sería tirar consultas: el perfil se construye
 * leyendo varias tablas enteras y una valoración suelta apenas lo mueve. Cada
 * cinco es suficiente para que se note dentro de la misma sesión.
 */
const REBUILD_EVERY = 5

export async function recordSwipe(
  itemIds: string[],
  reaction: 'dislike' | 'like' | 'love' | 'skip',
  reason?: string | null,
): Promise<SwipeResult> {
  const user = await requireUser()

  const parsed = swipeSchema.safeParse({ itemIds, reaction, reason: reason ?? null })
  if (!parsed.success) return { ok: false, error: 'Valoración no válida.' }

  const permiso = await checkEntitlement(user.id, 'swipe')
  if (!permiso.allowed) {
    return { ok: false, error: 'Has valorado muchos looks hoy. Mañana seguimos.' }
  }

  const supabase = await createClient()

  // Las prendas tienen que ser suyas. El RLS lo impediría igualmente al insertar,
  // pero así el error es claro y no una violación de política.
  const { data: owned } = await supabase
    .from('clothing_items')
    .select('id, category')
    .in('id', parsed.data.itemIds)
    .is('deleted_at', null)

  const rows = (owned ?? []) as Array<{ id: string; category: string }>
  if (rows.length !== parsed.data.itemIds.length) {
    return { ok: false, error: 'Alguna prenda ya no está en tu armario.' }
  }

  const signature = outfitSignature(parsed.data.itemIds)

  const { data: created, error: outfitError } = await supabase
    .from('outfits')
    .insert({
      user_id: user.id,
      source: 'engine',
      context: { signature, from: 'swipe' },
    })
    .select('id')
    .single()

  if (outfitError || !created) {
    console.error('[swipe] no se pudo guardar el look:', outfitError?.message)
    return { ok: false, error: 'No hemos podido guardar tu respuesta.' }
  }

  const outfitId = (created as { id: string }).id

  await supabase.from('outfit_items').insert(
    rows.map((row) => ({
      outfit_id: outfitId,
      clothing_item_id: row.id,
      role: layerOf(row.category as Category),
    })),
  )

  const { error: feedbackError } = await supabase.from('outfit_feedback').insert({
    user_id: user.id,
    outfit_id: outfitId,
    reaction: parsed.data.reaction,
    reason: parsed.data.reason ?? null,
  })

  if (feedbackError) {
    console.error('[swipe] no se pudo guardar la valoración:', feedbackError.message)
    return { ok: false, error: 'No hemos podido guardar tu respuesta.' }
  }

  await consumeEntitlement(user.id, 'swipe')

  await maybeRebuildProfile(user.id)

  return { ok: true, remaining: Math.max(0, permiso.remaining - 1) }
}

/** Recalcula el perfil cada cierto número de valoraciones. */
async function maybeRebuildProfile(userId: string) {
  try {
    const admin = createAdminClient()
    const { count } = await admin
      .from('outfit_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    if ((count ?? 0) % REBUILD_EVERY === 0) {
      await rebuildStyleProfile(userId)
      revalidatePath('/estilo')
    }
  } catch (err) {
    // Que no se actualice el perfil no invalida la respuesta que acaba de dar.
    console.error('[swipe] no se pudo recalcular el perfil:', err)
  }
}

/** Fuerza el recálculo al terminar la sesión de swipe. */
export async function finishSwipeSession() {
  const user = await requireUser()
  await rebuildStyleProfile(user.id).catch((err) =>
    console.error('[swipe] recálculo final fallido:', err),
  )
  revalidatePath('/estilo')
  revalidatePath('/outfits')
  return { ok: true }
}
