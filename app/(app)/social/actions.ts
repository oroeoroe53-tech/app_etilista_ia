'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { track } from '@/lib/observability/funnel'
import { log } from '@/lib/observability/log'
import { CHALLENGES, weekStart } from '@/lib/challenges/catalogue'

/**
 * Publicar el look del día en tu círculo, y quitarlo.
 *
 * Todo con el cliente del usuario: aquí el RLS sí sabe quién puede ver qué
 * (`in_same_circle()`), y publicar es escribir una fila propia. No hace falta
 * el service role para nada, que es la mejor señal de que esta función está
 * bien encajada.
 */

const shareSchema = z.object({
  outfitId: z.string().uuid(),
  note: z.string().trim().max(140).optional().or(z.literal('')),
})

export async function shareDailyLook(formData: FormData): Promise<void> {
  const user = await requireUser()

  const parsed = shareSchema.safeParse({
    outfitId: formData.get('outfitId'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return

  const supabase = await createClient()

  /*
   * El look tiene que ser tuyo.
   *
   * El RLS de `daily_shares` comprueba que la fila sea tuya, pero no que el
   * look lo sea: sin esto se podría publicar el identificador del look de otra
   * persona y enseñárselo a tu círculo como si fuera tuyo.
   */
  const { data: outfit } = await supabase
    .from('outfits')
    .select('id')
    .eq('id', parsed.data.outfitId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!outfit) return

  const { error } = await supabase.from('daily_shares').upsert(
    {
      user_id: user.id,
      outfit_id: parsed.data.outfitId,
      note: parsed.data.note || null,
      shared_on: new Date().toISOString().slice(0, 10),
    },
    // Publicar otra vez el mismo día sustituye: uno por día, como dice la tabla.
    { onConflict: 'user_id,shared_on' },
  )

  if (error) {
    log.warn({ event: 'feed.share_failed', reason: error.message })
    return
  }

  track('look_shared', user.id)
  revalidatePath('/social')
  revalidatePath('/social/feed')
  revalidatePath('/')
}

/** Quitarlo. Sin rastro, sin aviso y sin preguntar por qué. */
export async function unshareDailyLook(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('shareId'))
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase.from('daily_shares').delete().eq('id', parsed.data).eq('user_id', user.id)

  revalidatePath('/social')
  revalidatePath('/social/feed')
  revalidatePath('/')
}

/* --- Retos de la semana --------------------------------------------------- */

/**
 * Apuntarse al reto de la semana.
 *
 * Lo único que se guarda es que te apuntaste. El progreso se calcula del
 * historial cada vez que se mira, así que apuntarse no da ventaja ni marca
 * nada: solo te pone en la lista que ven tus amigas.
 */
export async function joinChallenge(formData: FormData): Promise<void> {
  const user = await requireUser()
  const challengeId = String(formData.get('challengeId') ?? '')

  // Contra el catálogo, no contra lo que llegue del formulario: sin esto se
  // podrían crear retos inventados desde el navegador.
  if (!CHALLENGES.some((c) => c.id === challengeId)) return

  const supabase = await createClient()
  await supabase.from('challenge_joins').upsert(
    { user_id: user.id, challenge_id: challengeId, week_start: weekStart() },
    { onConflict: 'user_id,challenge_id,week_start', ignoreDuplicates: true },
  )

  track('challenge_joined', user.id)
  revalidatePath('/social/retos')
  revalidatePath('/social')
}

export async function leaveChallenge(formData: FormData): Promise<void> {
  const user = await requireUser()
  const challengeId = String(formData.get('challengeId') ?? '')

  const supabase = await createClient()
  await supabase
    .from('challenge_joins')
    .delete()
    .eq('user_id', user.id)
    .eq('challenge_id', challengeId)
    .eq('week_start', weekStart())

  revalidatePath('/social/retos')
  revalidatePath('/social')
}

/**
 * Marcar el reto como completado.
 *
 * Se llama desde la propia pantalla cuando el progreso —calculado del
 * historial— ya llega al objetivo. No es una casilla que alguien pueda marcar:
 * es dejar constancia de algo que ya es verdad, para poder contarlo en el
 * resumen del mes sin recalcular doce semanas de historial.
 */
export async function markChallengeDone(challengeId: string): Promise<void> {
  const user = await requireUser()
  if (!CHALLENGES.some((c) => c.id === challengeId)) return

  const supabase = await createClient()
  await supabase
    .from('challenge_joins')
    .update({ completed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('challenge_id', challengeId)
    .eq('week_start', weekStart())
    .is('completed_at', null)
}
