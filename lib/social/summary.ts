import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Todo lo social, en un solo viaje.
 *
 * Antes eran seis consultas sueltas —votación abierta, looks sin ver,
 * préstamos, círculo, publicación de hoy, votaciones pendientes— y cada una un
 * viaje de ida y vuelta a la base de datos. En serie, desde un móvil con datos,
 * eso es la diferencia entre una pantalla que aparece y una que llega.
 *
 * Ahora las contesta `social_summary()` dentro de Postgres, donde las tablas
 * están a cero milisegundos unas de otras. Ver `0016_resumen_social.sql`.
 *
 * Se llama con el cliente del usuario, no con el admin: la función comprueba
 * que solo se pregunte por una misma.
 */

export interface PendingVoteSummary {
  token: string
  question: string | null
  closesAt: string
  ownerName: string
  options: number
}

export interface SocialSummary {
  openPoll: { token: string; closesAt: string; votes: number } | null
  pendingVotes: PendingVoteSummary[]
  unseenLooks: number
  pendingLoans: number
  circleCount: number
  sharedToday: boolean
  sharedNames: string[]
  duelsToAnswer: number
}

const EMPTY: SocialSummary = {
  openPoll: null,
  pendingVotes: [],
  unseenLooks: 0,
  pendingLoans: 0,
  circleCount: 0,
  sharedToday: false,
  sharedNames: [],
  duelsToAnswer: 0,
}

export async function getSocialSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<SocialSummary> {
  const { data, error } = await supabase.rpc('social_summary', { viewer: userId })

  /*
   * Si falla, la pantalla sigue.
   *
   * Esto es el adorno social de la portada, no la portada: un error aquí no
   * puede llevarse por delante el look del día. Se devuelve todo a cero y la
   * pantalla se pinta sin las filas sociales.
   */
  if (error || !data) return EMPTY

  const raw = data as Record<string, unknown>

  const poll = raw.open_poll as { token: string; closes_at: string; votes: number } | null

  return {
    openPoll: poll ? { token: poll.token, closesAt: poll.closes_at, votes: poll.votes } : null,
    pendingVotes: ((raw.pending_votes ?? []) as Array<Record<string, unknown>>).map((vote) => ({
      token: String(vote.token),
      question: typeof vote.question === 'string' ? vote.question : null,
      closesAt: String(vote.closes_at),
      ownerName: String(vote.owner_name),
      options: Number(vote.options ?? 0),
    })),
    unseenLooks: Number(raw.unseen_looks ?? 0),
    pendingLoans: Number(raw.pending_loans ?? 0),
    circleCount: Number(raw.circle_count ?? 0),
    sharedToday: Boolean(raw.shared_today),
    sharedNames: ((raw.shared_names ?? []) as string[]).map(String),
    duelsToAnswer: Number(raw.duels_to_answer ?? 0),
  }
}
