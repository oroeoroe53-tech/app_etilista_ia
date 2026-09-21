'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { newPollToken, looksLikeToken } from '@/lib/polls/token'
import { purgeExpiredPolls } from '@/lib/polls/purge'
import { track } from '@/lib/observability/funnel'
import { log } from '@/lib/observability/log'

/**
 * Crear una votación, votar y cerrarla.
 *
 * Aquí conviven dos clientes de Supabase y la diferencia importa:
 *
 *  · Para **crear**, el cliente del usuario. El RLS ya dice que solo puede
 *    crear votaciones suyas, así que la base de datos vigila sola.
 *  · Para **votar**, el cliente admin. Quien vota no tiene ningún permiso sobre
 *    una votación ajena —ni debe tenerlo— así que la comprobación se hace aquí,
 *    entera y a mano, antes de escribir nada.
 */

/*
 * Cuánto puede durar una votación.
 *
 * El mínimo son cinco minutos porque por debajo de eso nadie llega a contestar
 * y la función se estrena fallando. El máximo son tres horas porque esto sirve
 * para decidir qué te pones hoy: si hace falta un día, no era urgente, y una
 * votación abierta veinticuatro horas es una foto tuya circulando sin motivo.
 */
const MIN_MINUTES = 5
const MAX_MINUTES = 180

const createSchema = z.object({
  question: z.string().trim().max(120).optional().or(z.literal('')),
  minutes: z.coerce.number().int().min(MIN_MINUTES).max(MAX_MINUTES),
  paths: z.array(z.string().min(3).max(300)).min(2, 'Hacen falta al menos dos opciones.').max(4),
  labels: z.array(z.string().trim().max(40)).max(4).default([]),
})

export interface PollFormState {
  error?: string
}

export async function createPoll(
  _prev: PollFormState,
  formData: FormData,
): Promise<PollFormState> {
  const user = await requireUser()

  const parsed = createSchema.safeParse({
    question: formData.get('question') ?? '',
    minutes: formData.get('minutes'),
    paths: formData.getAll('paths').map(String),
    labels: formData.getAll('labels').map(String),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa las opciones.' }
  }

  const { question, minutes, paths, labels } = parsed.data

  /*
   * Las fotos tienen que estar en LA CARPETA DE QUIEN PREGUNTA.
   *
   * Las rutas llegan del navegador, así que llegan de alguien a quien no se le
   * puede creer nada. Sin esta comprobación, bastaría con escribir la ruta de
   * otra persona para publicar su foto dentro de una votación propia y saltarse
   * de un salto todo el aislamiento del bucket.
   */
  if (paths.some((path) => !path.startsWith(`${user.id}/`))) {
    log.warn({ event: 'polls.foreign_path_rejected' })
    return { error: 'No hemos podido usar esas fotos. Vuelve a subirlas.' }
  }

  const supabase = await createClient()
  const now = Date.now()

  const { data: poll, error } = await supabase
    .from('polls')
    .insert({
      owner_id: user.id,
      question: question || null,
      token: newPollToken(),
      closes_at: new Date(now + minutes * 60_000).toISOString(),
      // Un día desde ahora, pase lo que pase con la cuenta atrás.
      expires_at: new Date(now + 24 * 3600_000).toISOString(),
    })
    .select('id, token')
    .single()

  if (error || !poll) {
    log.warn({ event: 'polls.create_failed', reason: error?.message })
    return { error: 'No hemos podido crear la votación. Inténtalo otra vez.' }
  }

  const { error: optionsError } = await supabase.from('poll_options').insert(
    paths.map((path, index) => ({
      poll_id: poll.id,
      storage_path: path,
      label: labels[index]?.trim() || null,
      position: index + 1,
    })),
  )

  if (optionsError) {
    // Una votación sin opciones no sirve para nada y confundiría a quien abra
    // el enlace. Se deshace entera.
    await supabase.from('polls').delete().eq('id', poll.id)
    log.warn({ event: 'polls.options_failed', reason: optionsError.message })
    return { error: 'No hemos podido guardar las opciones. Inténtalo otra vez.' }
  }

  track('poll_created', user.id)

  // Aprovechando que alguien ha creado una votación, se barren las caducadas.
  // Fuera de la respuesta: quien pregunta tiene prisa.
  after(async () => {
    await purgeExpiredPolls()
  })

  redirect(`/v/${poll.token}`)
}

const voteSchema = z.object({
  token: z.string().refine(looksLikeToken, 'Enlace no válido.'),
  optionId: z.string().uuid(),
  comment: z.string().trim().max(140).optional().or(z.literal('')),
})

export interface VoteState {
  error?: string
}

export async function castVote(_prev: VoteState, formData: FormData): Promise<VoteState> {
  const user = await requireUser()

  const parsed = voteSchema.safeParse({
    token: formData.get('token'),
    optionId: formData.get('optionId'),
    comment: formData.get('comment') ?? '',
  })

  if (!parsed.success) return { error: 'No hemos podido registrar tu voto.' }
  const { token, optionId, comment } = parsed.data

  /*
   * A partir de aquí se usa el service role, así que esto es lo único que
   * separa un voto legítimo de cualquier otra cosa. Las cuatro comprobaciones
   * son obligatorias y ninguna la hace la base de datos por nosotros.
   */
  const admin = createAdminClient()

  const { data: poll } = await admin
    .from('polls')
    .select('id, owner_id, closes_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  // 1. Existe y no ha caducado.
  if (!poll || new Date(poll.expires_at).getTime() <= Date.now()) {
    return { error: 'Esta votación ya no está disponible.' }
  }

  // 2. Sigue abierta. La cuenta atrás no es decorativa: pasada la hora, los
  //    votos que lleguen ya no le sirven a nadie y falsearían el resultado que
  //    alguien ya ha leído para vestirse.
  if (new Date(poll.closes_at).getTime() <= Date.now()) {
    return { error: 'La votación se ha cerrado.' }
  }

  // 3. Quien pregunta no vota. Votarse a una misma no es una opinión.
  if (poll.owner_id === user.id) {
    return { error: 'Esta votación es tuya: esperas opiniones, no votas.' }
  }

  // 4. La opción pertenece A ESTA votación. Sin esto, un identificador de otra
  //    votación colaría un voto donde no toca.
  const { data: option } = await admin
    .from('poll_options')
    .select('id')
    .eq('id', optionId)
    .eq('poll_id', poll.id)
    .maybeSingle()

  if (!option) return { error: 'Esa opción ya no está.' }

  const { error } = await admin.from('poll_votes').upsert(
    {
      poll_id: poll.id,
      option_id: optionId,
      voter_id: user.id,
      comment: comment || null,
    },
    // Cambiar de opinión sustituye el voto. Nadie vota dos veces.
    { onConflict: 'poll_id,voter_id' },
  )

  if (error) {
    log.warn({ event: 'polls.vote_failed', reason: error.message })
    return { error: 'No hemos podido registrar tu voto.' }
  }

  track('poll_voted', user.id)
  revalidatePath(`/v/${token}`)
  return {}
}

/** Cerrar antes de tiempo: ya está decidido y hay que salir. */
export async function closePoll(formData: FormData): Promise<void> {
  const user = await requireUser()
  const token = String(formData.get('token') ?? '')
  if (!looksLikeToken(token)) return

  const supabase = await createClient()
  // El RLS ya impide cerrar una votación ajena: el `update` no encuentra fila.
  await supabase
    .from('polls')
    .update({ closes_at: new Date().toISOString() })
    .eq('token', token)
    .eq('owner_id', user.id)

  revalidatePath(`/v/${token}`)
}
