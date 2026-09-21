'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { newLinkToken, looksLikeToken } from '@/lib/security/link-token'
import { requestOrigin } from '@/lib/utils/origin'
import { track } from '@/lib/observability/funnel'
import { log } from '@/lib/observability/log'

/**
 * El círculo: invitar, aceptar, dar permiso y salir.
 *
 * Dos reglas gobiernan este archivo entero:
 *
 *  1. **Entrar en el círculo de alguien exige un enlace suyo.** No hay búsqueda
 *     de usuarios, ni «añadir por correo», ni solicitudes de amistad que
 *     lleguen sin haberlas pedido. Quien no ha dado un enlace no recibe a
 *     nadie, y por tanto no hay forma de que un desconocido aparezca en la
 *     pantalla de otro.
 *  2. **Estar en el círculo no abre el armario.** El permiso se concede después
 *     y por separado (`wardrobe_grants`), y se retira sin tener que echar a
 *     nadie.
 */

/** Cuántas invitaciones vivas puede tener alguien a la vez. */
const MAX_OPEN_INVITES = 20

/**
 * Crear una invitación y devolver su enlace.
 *
 * Se crea una nueva cada vez que se pulsa compartir, y cada una sirve para una
 * sola persona. Un único enlace permanente sería más cómodo y exactamente por
 * eso peor: reenviado a un grupo, mete en el círculo a cualquiera que pase.
 */
export async function createInvite(): Promise<{ url: string } | { error: string }> {
  const user = await requireUser()
  const supabase = await createClient()

  /*
   * De paso, se tiran las caducadas de quien pide.
   *
   * Son filas muertas que solo estorban al contar las abiertas, y limpiarlas
   * aquí evita tener que montar una tarea programada para tres registros.
   */
  await supabase
    .from('circle_invites')
    .delete()
    .eq('inviter_id', user.id)
    .is('used_by', null)
    .lt('expires_at', new Date().toISOString())

  // Tope de invitaciones abiertas: sin él, un botón que se pulsa con curiosidad
  // veinte veces deja veinte puertas abiertas durante una semana.
  const { count } = await supabase
    .from('circle_invites')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_id', user.id)
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())

  if ((count ?? 0) >= MAX_OPEN_INVITES) {
    return { error: 'Tienes muchas invitaciones sin usar. Espera a que caduquen.' }
  }

  const { data, error } = await supabase
    .from('circle_invites')
    .insert({ inviter_id: user.id, token: newLinkToken() })
    .select('token')
    .single()

  if (error || !data) {
    log.warn({ event: 'circle.invite_failed', reason: error?.message })
    return { error: 'No hemos podido crear la invitación.' }
  }

  track('circle_invited', user.id)
  return { url: `${await requestOrigin()}/c/${data.token}` }
}

/**
 * Aceptar una invitación.
 *
 * Escribe las dos filas de la relación —una por sentido— y marca la invitación
 * como usada. Va con el cliente admin porque quien acepta no tiene ningún
 * permiso sobre las filas de quien invita, ni debe tenerlo: todo lo que le
 * autoriza es el token, y eso se comprueba aquí.
 */
export async function acceptInvite(formData: FormData): Promise<void> {
  const user = await requireUser()
  const token = String(formData.get('token') ?? '')
  if (!looksLikeToken(token)) return

  const admin = createAdminClient()

  const { data: invite } = await admin
    .from('circle_invites')
    .select('id, inviter_id, used_by, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return

  const row = invite as {
    id: string
    inviter_id: string
    used_by: string | null
    expires_at: string
  }

  // Las cuatro razones para no aceptar. Ninguna la comprueba la base de datos.
  if (row.used_by) return
  if (new Date(row.expires_at).getTime() <= Date.now()) return
  if (row.inviter_id === user.id) return

  const { error } = await admin
    .from('connections')
    .upsert(
      [
        { user_id: user.id, friend_id: row.inviter_id },
        { user_id: row.inviter_id, friend_id: user.id },
      ],
      // Volver a aceptar no duplica: la relación ya existe y no pasa nada.
      { onConflict: 'user_id,friend_id', ignoreDuplicates: true },
    )

  if (error) {
    log.warn({ event: 'circle.accept_failed', reason: error.message })
    return
  }

  /*
   * La invitación se quema DESPUÉS de crear la relación.
   *
   * Al revés, un fallo al escribir la relación dejaría la invitación gastada y
   * a la persona fuera, sin forma de volver a entrar con el mismo enlace.
   */
  await admin
    .from('circle_invites')
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_by', null)

  track('circle_joined', user.id)
  revalidatePath('/circulo')
  redirect('/circulo')
}

const grantSchema = z.object({
  friendId: z.string().uuid(),
  level: z.enum(['none', 'view', 'style']),
})

/**
 * Cambiar lo que alguien puede ver de tu armario.
 *
 * Tres estados y una sola acción, porque son el mismo dial: nada, mirar, o
 * mirar y montarte looks. Con dos interruptores independientes existiría el
 * estado «puede montarme looks pero no ver mi ropa», que no significa nada.
 */
export async function setGrant(formData: FormData): Promise<void> {
  const user = await requireUser()

  const parsed = grantSchema.safeParse({
    friendId: formData.get('friendId'),
    level: formData.get('level'),
  })
  if (!parsed.success) return

  const { friendId, level } = parsed.data
  const supabase = await createClient()

  /*
   * Solo a gente del círculo.
   *
   * El RLS deja dar permiso sobre el armario propio a cualquier identificador,
   * porque desde su punto de vista la fila es tuya y es correcta. Que la otra
   * persona sea de tu círculo es una regla del producto, y se comprueba aquí.
   */
  const { data: link } = await supabase
    .from('connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('friend_id', friendId)
    .maybeSingle()

  if (!link) return

  if (level === 'none') {
    await supabase
      .from('wardrobe_grants')
      .delete()
      .eq('owner_id', user.id)
      .eq('viewer_id', friendId)
  } else {
    await supabase
      .from('wardrobe_grants')
      .upsert({ owner_id: user.id, viewer_id: friendId, level }, { onConflict: 'owner_id,viewer_id' })
  }

  revalidatePath('/circulo')
}

/**
 * Salir del círculo de alguien.
 *
 * Se va la relación **en los dos sentidos** y los permisos **en los dos
 * sentidos**. Quitar solo el lado propio dejaría a la otra persona viéndote en
 * su lista y, peor, con el permiso sobre tu armario intacto.
 *
 * No se avisa a nadie. Una notificación de «te han quitado del círculo» es una
 * crueldad automatizada que no arregla nada.
 */
export async function removeFriend(formData: FormData): Promise<void> {
  const user = await requireUser()
  const friendId = String(formData.get('friendId') ?? '')

  const parsed = z.string().uuid().safeParse(friendId)
  if (!parsed.success) return

  const admin = createAdminClient()

  await admin
    .from('connections')
    .delete()
    .or(
      `and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`,
    )

  await admin
    .from('wardrobe_grants')
    .delete()
    .or(
      `and(owner_id.eq.${user.id},viewer_id.eq.${friendId}),and(owner_id.eq.${friendId},viewer_id.eq.${user.id})`,
    )

  revalidatePath('/circulo')
}
