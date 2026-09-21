import { createAdminClient } from '@/lib/supabase/admin'
import { neglectCutoffs } from '@/lib/wardrobe/neglected'
import {
  challengeOfWeek,
  challengeProgress,
  weekStart,
  type Challenge,
  type Progress,
  type WornEntry,
} from './catalogue'

/**
 * El reto de la semana, con lo que llevas hecho.
 *
 * El progreso **se calcula aquí cada vez**, del historial. No hay contador
 * guardado que pueda desviarse de la verdad, y por eso tampoco hay forma de
 * decir que has completado un reto sin haberte puesto la ropa.
 */

export interface ChallengeState {
  challenge: Challenge
  weekStart: string
  joined: boolean
  progress: Progress
  /** Quién del círculo se ha apuntado. Nombres, no un número. */
  others: string[]
}

const ANON = 'Alguien'

export async function getChallengeState(userId: string): Promise<ChallengeState> {
  const supabase = createAdminClient()

  const now = new Date()
  const challenge = challengeOfWeek(now)
  const week = weekStart(now)
  const cutoffs = neglectCutoffs()

  const [{ data: joins }, { data: worn }, { data: forgotten }, { data: links }] =
    await Promise.all([
      supabase
        .from('challenge_joins')
        .select('user_id')
        .eq('challenge_id', challenge.id)
        .eq('week_start', week),
      /*
       * Lo puesto esta semana, con el color de cada prenda.
       *
       * El color viene del armario y no del historial porque el historial
       * guarda qué prenda, no de qué color era: si alguien reetiqueta una
       * prenda, el reto se recalcula con el dato bueno.
       */
      supabase
        .from('wear_history')
        .select('worn_on, clothing_item_id, clothing_items(primary_color)')
        .eq('user_id', userId)
        .gte('worn_on', week),
      // Las prendas que ya estaban olvidadas, para el reto de rescatarlas.
      supabase
        .from('clothing_items')
        .select('id')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .or(`last_worn_at.lt.${cutoffs.lastWornBefore},last_worn_at.is.null`),
      supabase.from('connections').select('friend_id').eq('user_id', userId),
    ])

  const joinedIds = new Set(((joins ?? []) as { user_id: string }[]).map((j) => j.user_id))
  const friends = new Set(
    ((links ?? []) as { friend_id: string }[]).map((l) => l.friend_id),
  )

  const entries: WornEntry[] = (
    (worn ?? []) as unknown as {
      worn_on: string
      clothing_item_id: string
      clothing_items: { primary_color: string } | null
    }[]
  ).map((row) => ({
    day: row.worn_on,
    itemId: row.clothing_item_id,
    color: row.clothing_items?.primary_color ?? '',
  }))

  const forgottenIds = new Set(((forgotten ?? []) as { id: string }[]).map((f) => f.id))

  // Los nombres de quien se apuntó, solo si es de tu círculo: apuntarse a un
  // reto no te pone en la lista de desconocidos.
  const otherIds = [...joinedIds].filter((id) => id !== userId && friends.has(id))

  let others: string[] = []
  if (otherIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('display_name')
      .in('id', otherIds)
    others = ((profiles ?? []) as { display_name: string | null }[]).map(
      (p) => p.display_name?.trim() || ANON,
    )
  }

  return {
    challenge,
    weekStart: week,
    joined: joinedIds.has(userId),
    progress: challengeProgress(challenge.id, entries, forgottenIds),
    others,
  }
}

/** Cuántos retos completó alguien en un mes. Para el resumen. */
export async function countChallengesDone(userId: string, month: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('challenge_joins')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .gte('week_start', `${month}-01`)
    .lte('week_start', `${month}-31`)
  return count ?? 0
}
