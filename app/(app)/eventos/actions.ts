'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { newLinkToken, looksLikeToken } from '@/lib/security/link-token'
import { purgeExpiredEvents, purgeEventPhotos } from '@/lib/events/purge'
import { requestOrigin } from '@/lib/utils/origin'
import { COLORS } from '@/lib/wardrobe/taxonomy'
import { track } from '@/lib/observability/funnel'
import { log } from '@/lib/observability/log'

/**
 * Eventos: crear, invitar, apuntarse y decir de qué vas.
 *
 * Casi todo pasa por el cliente del usuario, porque aquí el RLS sí sabe quién
 * puede ver qué (`is_event_guest()`). El service role solo aparece para
 * apuntarse a un evento al que se llega por un enlace: en ese momento la
 * persona todavía no es invitada, así que ninguna política la deja ver nada, y
 * lo único que la autoriza es el token.
 */

const createSchema = z.object({
  title: z.string().trim().min(1, 'Ponle un nombre.').max(80),
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige una fecha.'),
  place: z.string().trim().max(80).optional().or(z.literal('')),
})

export interface EventFormState {
  error?: string
}

export async function createEvent(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const user = await requireUser()

  const parsed = createSchema.safeParse({
    title: formData.get('title'),
    heldOn: formData.get('heldOn'),
    place: formData.get('place') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }

  const { title, heldOn, place } = parsed.data

  /*
   * Una semana después del evento se borra todo, fotos incluidas.
   *
   * Se calcula aquí y no en la base de datos porque depende de la fecha del
   * evento, no de la de creación: un evento que se organiza con seis meses de
   * antelación tiene que sobrevivir esos seis meses.
   */
  const expiresAt = new Date(`${heldOn}T00:00:00Z`)
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 7)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .insert({
      owner_id: user.id,
      title,
      held_on: heldOn,
      place: place || null,
      token: newLinkToken(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    log.warn({ event: 'events.create_failed', reason: error?.message })
    return { error: 'No hemos podido crear el evento.' }
  }

  // Quien organiza también va: se apunta sola, porque tener que apuntarse al
  // evento propio es el tipo de paso que hace que la lista salga incompleta.
  await supabase.from('event_guests').insert({ event_id: data.id, user_id: user.id })

  track('event_created', user.id)

  after(async () => {
    await purgeExpiredEvents()
  })

  redirect(`/eventos/${data.id}`)
}

/** El enlace para invitar. Se genera al crear el evento y no caduca aparte. */
export async function eventInviteUrl(eventId: string): Promise<string | null> {
  const user = await requireUser()
  const supabase = await createClient()

  // El RLS ya impide leer el evento de otra persona; el filtro por dueño evita
  // además que una invitada reparta invitaciones que no son suyas.
  const { data } = await supabase
    .from('events')
    .select('token')
    .eq('id', eventId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!data) return null
  return `${await requestOrigin()}/e/${(data as { token: string }).token}`
}

/** Apuntarse desde el enlace. */
export async function joinEvent(formData: FormData): Promise<void> {
  const user = await requireUser()
  const token = String(formData.get('token') ?? '')
  if (!looksLikeToken(token)) return

  const admin = createAdminClient()

  const { data } = await admin
    .from('events')
    .select('id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!data) return
  const event = data as { id: string; expires_at: string }
  if (new Date(event.expires_at).getTime() <= Date.now()) return

  const { error } = await admin
    .from('event_guests')
    .upsert(
      { event_id: event.id, user_id: user.id },
      { onConflict: 'event_id,user_id', ignoreDuplicates: true },
    )

  if (error) {
    log.warn({ event: 'events.join_failed', reason: error.message })
    return
  }

  track('event_joined', user.id)
  redirect(`/eventos/${event.id}`)
}

const outfitSchema = z.object({
  eventId: z.string().uuid(),
  note: z.string().trim().max(120).optional().or(z.literal('')),
  color: z.enum(['', ...COLORS] as unknown as [string, ...string[]]).optional(),
  photoPath: z.string().max(300).optional().or(z.literal('')),
})

/**
 * Decir de qué vas.
 *
 * Los tres campos son opcionales por separado: hay quien subirá una foto sin
 * escribir nada y quien escribirá «el vestido verde» sin foto. Exigir la foto
 * dejaría media lista vacía, y una lista a medias no evita que nadie vaya
 * igual.
 */
export async function setMyOutfit(formData: FormData): Promise<void> {
  const user = await requireUser()

  const parsed = outfitSchema.safeParse({
    eventId: formData.get('eventId'),
    note: formData.get('note') ?? '',
    color: formData.get('color') ?? '',
    photoPath: formData.get('photoPath') ?? '',
  })
  if (!parsed.success) return

  const { eventId, note, color, photoPath } = parsed.data

  // La foto tiene que estar en la carpeta de quien la sube. Igual que en las
  // votaciones: la ruta viene del navegador y no se le puede creer nada.
  if (photoPath && !photoPath.startsWith(`${user.id}/`)) {
    log.warn({ event: 'events.foreign_path_rejected' })
    return
  }

  const supabase = await createClient()

  await supabase
    .from('event_guests')
    .update({
      outfit_note: note || null,
      outfit_color: color || null,
      // Una ruta vacía no borra la foto anterior: el formulario se envía
      // también al cambiar solo el color, y no debería llevarse la foto por
      // delante.
      ...(photoPath ? { photo_path: photoPath } : {}),
    })
    .eq('event_id', eventId)
    .eq('user_id', user.id)

  revalidatePath(`/eventos/${eventId}`)
}

/** Salirse de un evento. */
export async function leaveEvent(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('eventId'))
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase
    .from('event_guests')
    .delete()
    .eq('event_id', parsed.data)
    .eq('user_id', user.id)

  redirect('/eventos')
}

/** Cancelar un evento entero. Solo quien lo creó. */
export async function deleteEvent(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('eventId'))
  if (!parsed.success) return

  const supabase = await createClient()

  /*
   * Las fotos, ANTES de borrar el evento.
   *
   * Al borrar la fila del evento, la cascada se lleva las de las invitadas y
   * con ellas las rutas de sus fotos. Después de eso ya no hay forma de saber
   * qué archivos había que borrar: se quedarían en Storage para siempre,
   * invisibles y facturando. Por eso esto NO va en `after()`.
   */
  const { data: owned } = await supabase
    .from('events')
    .select('id')
    .eq('id', parsed.data)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!owned) return

  await purgeEventPhotos(parsed.data)
  await supabase.from('events').delete().eq('id', parsed.data).eq('owner_id', user.id)

  redirect('/eventos')
}
