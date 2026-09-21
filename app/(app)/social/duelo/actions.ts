'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { composePollLooks } from '@/lib/polls/compose'
import { OCCASIONS } from '@/lib/wardrobe/taxonomy'
import { track } from '@/lib/observability/funnel'
import { log } from '@/lib/observability/log'

/**
 * Retar, aceptar y votar.
 *
 * La regla que gobierna este archivo: **el look de cada una se compone con su
 * propia ropa y solo después de que ella diga que sí**.
 *
 * Es tentador componer los dos al proponer el duelo —una consulta menos, una
 * pantalla más rápida— y sería un error: eso significaría sacar prendas del
 * armario de alguien para enseñárselas a un grupo antes de que esa persona
 * sepa siquiera que existe el duelo. Aquí se compone al aceptar.
 */

const challengeSchema = z.object({
  opponentId: z.string().uuid(),
  occasion: z.enum(OCCASIONS as unknown as [string, ...string[]]),
})

export interface DuelState {
  error?: string
}

export async function createDuel(_prev: DuelState, formData: FormData): Promise<DuelState> {
  const user = await requireUser()

  const parsed = challengeSchema.safeParse({
    opponentId: formData.get('opponentId'),
    occasion: formData.get('occasion'),
  })
  if (!parsed.success) return { error: 'Elige a quién retas y para qué.' }

  const supabase = await createClient()

  // Solo a gente de tu círculo. La política de la tabla también lo exige; aquí
  // se comprueba para poder contestar con una frase en vez de un error.
  const { data: link } = await supabase
    .from('connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('friend_id', parsed.data.opponentId)
    .maybeSingle()

  if (!link) return { error: 'Solo puedes retar a gente de tu círculo.' }

  // Tu look, con tu ropa. El suyo se compondrá cuando acepte.
  const composed = await composePollLooks(supabase, user.id, {
    occasion: parsed.data.occasion as never,
    count: 1,
  })
  if ('error' in composed) return { error: composed.error }

  const { data: duel, error } = await supabase
    .from('duels')
    .insert({
      challenger_id: user.id,
      opponent_id: parsed.data.opponentId,
      occasion: parsed.data.occasion,
      challenger_outfit_id: composed.outfitIds[0],
    })
    .select('id')
    .single()

  if (error || !duel) {
    log.warn({ event: 'duels.create_failed', reason: error?.message })
    return { error: 'No hemos podido crear el duelo.' }
  }

  track('duel_created', user.id)
  redirect(`/social/duelo/${duel.id}`)
}

/**
 * Aceptar el reto.
 *
 * Aquí, y solo aquí, se compone el look con la ropa de quien acepta. Es el
 * momento en que esa persona decide que su ropa entre en el juego.
 */
export async function acceptDuel(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('duelId'))
  if (!parsed.success) return

  const supabase = await createClient()

  const { data: duel } = await supabase
    .from('duels')
    .select('id, opponent_id, occasion, status')
    .eq('id', parsed.data)
    .maybeSingle()

  if (!duel) return
  const row = duel as { id: string; opponent_id: string; occasion: string; status: string }

  if (row.opponent_id !== user.id || row.status !== 'pending') return

  const composed = await composePollLooks(supabase, user.id, {
    occasion: row.occasion as never,
    count: 1,
  })
  if ('error' in composed) return

  await supabase
    .from('duels')
    .update({
      status: 'open',
      opponent_outfit_id: composed.outfitIds[0],
      // Dos días: lo justo para que el círculo entre a mirar sin que el duelo
      // se quede colgando una semana.
      closes_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    })
    .eq('id', row.id)

  revalidatePath(`/social/duelo/${row.id}`)
  revalidatePath('/social')
}

/** Decir que no. Sin explicaciones y sin que la otra reciba un sermón. */
export async function declineDuel(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('duelId'))
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase
    .from('duels')
    .update({ status: 'declined' })
    .eq('id', parsed.data)
    .eq('opponent_id', user.id)
    .eq('status', 'pending')

  revalidatePath('/social')
  redirect('/social')
}

const voteSchema = z.object({
  duelId: z.string().uuid(),
  side: z.enum(['a', 'b']),
})

/**
 * Votar a ciegas.
 *
 * Se guarda el lado, no la persona: quien vota está eligiendo un look sin saber
 * de quién es, y eso es exactamente lo que se registra.
 */
export async function voteDuel(formData: FormData): Promise<void> {
  const user = await requireUser()

  const parsed = voteSchema.safeParse({
    duelId: formData.get('duelId'),
    side: formData.get('side'),
  })
  if (!parsed.success) return

  const admin = createAdminClient()

  const { data: duel } = await admin
    .from('duels')
    .select('id, challenger_id, opponent_id, status, closes_at')
    .eq('id', parsed.data.duelId)
    .maybeSingle()

  if (!duel) return
  const row = duel as {
    id: string
    challenger_id: string
    opponent_id: string
    status: string
    closes_at: string | null
  }

  // Abierto, en plazo, y quien vota no es del duelo.
  if (row.status !== 'open') return
  if (row.closes_at && new Date(row.closes_at).getTime() <= Date.now()) return
  if (user.id === row.challenger_id || user.id === row.opponent_id) return

  // Y de un círculo u otro: el duelo se vota entre amigas, no en público.
  const { data: links } = await admin
    .from('connections')
    .select('user_id')
    .eq('friend_id', user.id)
    .in('user_id', [row.challenger_id, row.opponent_id])

  if ((links ?? []).length === 0) return

  const { error } = await admin
    .from('duel_votes')
    .upsert(
      { duel_id: row.id, voter_id: user.id, side: parsed.data.side },
      { onConflict: 'duel_id,voter_id' },
    )

  if (error) {
    log.warn({ event: 'duels.vote_failed', reason: error.message })
    return
  }

  track('duel_voted', user.id)
  revalidatePath(`/social/duelo/${row.id}`)
}
