import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { looksLikeToken } from '@/lib/security/link-token'
import type { PollComment, PollOptionView, PollView } from './types'

/**
 * Leer una votación por su enlace.
 *
 * Este archivo es la cerradura de la que habla `0008_votacion.sql`. Aquí se usa
 * el service role —que salta el RLS— y por tanto **cada consulta tiene que
 * ganarse el derecho a existir**:
 *
 *  1. El token tiene forma de token. Si no, ni se consulta.
 *  2. Existe una votación con ese token exacto. No hay búsqueda parcial, ni por
 *     dueño, ni por fecha: solo igualdad contra un valor único.
 *  3. No ha caducado. Una votación de ayer no se enseña aunque el enlace siga
 *     circulando por el grupo.
 *
 * Fuera de esas tres condiciones, este módulo no devuelve absolutamente nada, y
 * nada de lo que devuelve depende de quién pregunte salvo su propio voto.
 */

/** Diez minutos: lo que dura mirar unas fotos y decidir. */
const PHOTO_EXPIRY_SECONDS = 600

interface PollRow {
  id: string
  owner_id: string
  question: string | null
  token: string
  closes_at: string
  expires_at: string
}

interface OptionRow {
  id: string
  storage_path: string
  label: string | null
  position: number
}

interface VoteRow {
  option_id: string
  voter_id: string
  comment: string | null
  created_at: string
}

/** Cómo se llama alguien cuando no ha puesto nombre. */
const ANON = 'Alguien'

async function namesOf(
  supabase: ReturnType<typeof createAdminClient>,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return names

  const { data } = await supabase.from('profiles').select('id, display_name').in('id', unique)

  for (const row of (data ?? []) as { id: string; display_name: string | null }[]) {
    // Solo el nombre. Nunca el correo: quien vota no tiene por qué acabar
    // conociendo la dirección de los demás por haber opinado sobre un vestido.
    names.set(row.id, row.display_name?.trim() || ANON)
  }
  return names
}

export async function loadPollByToken(
  token: string,
  viewerId: string | null,
): Promise<PollView | null> {
  if (!looksLikeToken(token)) return null

  const supabase = createAdminClient()

  const { data: pollData, error } = await supabase
    .from('polls')
    .select('id, owner_id, question, token, closes_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !pollData) return null
  const poll = pollData as PollRow

  // Caducada es lo mismo que inexistente. No se distingue a propósito: así el
  // enlace viejo que alguien reenvía no confirma siquiera que existió.
  if (new Date(poll.expires_at).getTime() <= Date.now()) return null

  const [{ data: optionData }, { data: voteData }] = await Promise.all([
    supabase
      .from('poll_options')
      .select('id, storage_path, label, position')
      .eq('poll_id', poll.id)
      .order('position'),
    supabase
      .from('poll_votes')
      .select('option_id, voter_id, comment, created_at')
      .eq('poll_id', poll.id)
      .order('created_at'),
  ])

  const optionRows = (optionData ?? []) as OptionRow[]
  const votes = (voteData ?? []) as VoteRow[]

  const signed = await supabase.storage
    .from(BUCKETS.pollPhotos)
    .createSignedUrls(
      optionRows.map((o) => o.storage_path),
      PHOTO_EXPIRY_SECONDS,
    )

  const urls = new Map<string, string>()
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }

  const names = await namesOf(supabase, [poll.owner_id, ...votes.map((v) => v.voter_id)])

  const options: PollOptionView[] = optionRows.map((row) => {
    const mine = votes.filter((v) => v.option_id === row.id)
    return {
      id: row.id,
      position: row.position,
      label: row.label,
      imageUrl: urls.get(row.storage_path) ?? null,
      votes: mine.length,
      share: votes.length === 0 ? 0 : Math.round((mine.length / votes.length) * 100),
      voters: mine.map((v) => names.get(v.voter_id) ?? ANON),
    }
  })

  const myVote = viewerId ? votes.find((v) => v.voter_id === viewerId) : undefined

  const comments: PollComment[] = votes
    .filter((v) => v.comment?.trim())
    .map((v) => ({
      name: names.get(v.voter_id) ?? ANON,
      optionPosition: optionRows.find((o) => o.id === v.option_id)?.position ?? 0,
      text: v.comment!.trim(),
    }))

  return {
    id: poll.id,
    token: poll.token,
    question: poll.question,
    ownerId: poll.owner_id,
    ownerName: names.get(poll.owner_id) ?? ANON,
    isOwner: viewerId === poll.owner_id,
    closesAt: poll.closes_at,
    closed: new Date(poll.closes_at).getTime() <= Date.now(),
    options,
    totalVotes: votes.length,
    myVote: myVote ? { optionId: myVote.option_id, comment: myVote.comment } : null,
    comments,
    leadingOptionId: leaderOf(options),
  }
}

/**
 * Quién va ganando.
 *
 * Devuelve `null` si nadie ha votado o si hay empate arriba. Ver la nota de
 * `PollView.leadingOptionId`: un empate se dice.
 */
export function leaderOf(options: readonly PollOptionView[]): string | null {
  let best: PollOptionView | null = null
  let tied = false

  for (const option of options) {
    if (option.votes === 0) continue
    if (!best || option.votes > best.votes) {
      best = option
      tied = false
    } else if (option.votes === best.votes) {
      tied = true
    }
  }

  return best && !tied ? best.id : null
}

/** Las votaciones vivas de alguien, para su propia pantalla. */
export interface PollSummary {
  token: string
  question: string | null
  closesAt: string
  closed: boolean
  totalVotes: number
  options: number
}

export async function listMyPolls(userId: string): Promise<PollSummary[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('polls')
    .select('id, token, question, closes_at, expires_at, poll_options(id), poll_votes(id)')
    .eq('owner_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  type Row = PollRow & { poll_options: unknown[]; poll_votes: unknown[] }

  return ((data ?? []) as Row[]).map((row) => ({
    token: row.token,
    question: row.question,
    closesAt: row.closes_at,
    closed: new Date(row.closes_at).getTime() <= Date.now(),
    totalVotes: row.poll_votes?.length ?? 0,
    options: row.poll_options?.length ?? 0,
  }))
}

/**
 * Las votaciones del círculo que esperan tu voto.
 *
 * **Esto cambia quién ve una votación**, así que conviene decirlo claro: hasta
 * ahora una votación solo la veía quien recibía el enlace. Desde aquí, además,
 * la ven las personas de tu círculo, sin que tengas que mandarles nada.
 *
 * Es lo que pide el diseño («Tres amigas esperan tu voto») y es lo que hace que
 * la pantalla social tenga algo dentro el primer día. El enlace sigue
 * existiendo para quien no está en el círculo.
 *
 * Lo que NO cambia: las fotos siguen caducando a las 24 horas, la votación
 * sigue cerrándose a su hora, y `/privacidad` lo cuenta.
 */
export interface PendingVote {
  token: string
  question: string | null
  ownerName: string
  closesAt: string
  options: number
}

export async function listPendingVotes(userId: string): Promise<PendingVote[]> {
  const supabase = createAdminClient()

  // 1. Quién es de tu círculo. Sin esto no hay nada que enseñar: una votación
  //    de alguien de fuera no aparece aquí ni aunque esté abierta.
  const { data: links } = await supabase
    .from('connections')
    .select('friend_id')
    .eq('user_id', userId)

  const friends = ((links ?? []) as { friend_id: string }[]).map((l) => l.friend_id)
  if (friends.length === 0) return []

  const now = new Date().toISOString()

  const { data } = await supabase
    .from('polls')
    .select('id, token, question, owner_id, closes_at, poll_options(id), poll_votes(voter_id)')
    .in('owner_id', friends)
    .gt('closes_at', now)
    .gt('expires_at', now)
    .order('closes_at', { ascending: true })
    .limit(12)

  type Row = {
    id: string
    token: string
    question: string | null
    owner_id: string
    closes_at: string
    poll_options: unknown[]
    poll_votes: { voter_id: string }[]
  }

  // 2. Las que ya has votado no esperan nada de ti.
  const rows = ((data ?? []) as Row[]).filter(
    (row) => !row.poll_votes?.some((v) => v.voter_id === userId),
  )
  if (rows.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [...new Set(rows.map((r) => r.owner_id))])

  const names = new Map<string, string>()
  for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    names.set(row.id, row.display_name?.trim() || 'Alguien')
  }

  return rows.map((row) => ({
    token: row.token,
    question: row.question,
    ownerName: names.get(row.owner_id) ?? 'Alguien',
    closesAt: row.closes_at,
    options: row.poll_options?.length ?? 0,
  }))
}
