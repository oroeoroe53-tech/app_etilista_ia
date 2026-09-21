'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { track } from '@/lib/observability/funnel'
import { log } from '@/lib/observability/log'

/**
 * Pedir, aceptar, rechazar y devolver.
 *
 * Un préstamo toca la ropa de dos personas a la vez, así que todo pasa por el
 * service role y **ninguna comprobación se delega**. Las reglas, todas escritas
 * aquí:
 *
 *  · Solo se pide lo que se puede ver (hay permiso del dueño).
 *  · Solo el dueño acepta o rechaza.
 *  · Cualquiera de las dos partes puede dar por devuelta una prenda: quien la
 *    devuelve en mano y quien la recibe. Obligar a que sea siempre el dueño
 *    dejaría préstamos abiertos para siempre el día que alguien deje de entrar.
 *  · Quien pidió puede cancelar mientras nadie le haya contestado.
 */

const requestSchema = z.object({
  itemId: z.string().uuid(),
  ownerId: z.string().uuid(),
  message: z.string().trim().max(140).optional().or(z.literal('')),
})

export interface LoanState {
  error?: string
  ok?: boolean
}

export async function requestLoan(_prev: LoanState, formData: FormData): Promise<LoanState> {
  const user = await requireUser()

  const parsed = requestSchema.safeParse({
    itemId: formData.get('itemId'),
    ownerId: formData.get('ownerId'),
    message: formData.get('message') ?? '',
  })
  if (!parsed.success) return { error: 'No hemos podido enviar la petición.' }

  const { itemId, ownerId, message } = parsed.data
  const admin = createAdminClient()

  // 1. Hay permiso. Es la misma comprobación que hace la política de la tabla,
  //    repetida aquí para poder contestar con un mensaje en vez de un error.
  const { data: grant } = await admin
    .from('wardrobe_grants')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('viewer_id', user.id)
    .maybeSingle()

  if (!grant) return { error: 'Ya no tienes acceso a ese armario.' }

  // 2. La prenda es de quien se dice. Sin esto, se podría pedir la prenda de
  //    una tercera persona usando el identificador de un armario que sí se ve.
  const { data: item } = await admin
    .from('clothing_items')
    .select('id')
    .eq('id', itemId)
    .eq('user_id', ownerId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!item) return { error: 'Esa prenda ya no está.' }

  const { error } = await admin.from('loans').insert({
    item_id: itemId,
    owner_id: ownerId,
    borrower_id: user.id,
    message: message || null,
  })

  if (error) {
    // El índice único de «un préstamo vivo por prenda» salta aquí: es el caso
    // de dos personas pidiendo lo mismo a la vez, y no es un fallo.
    if (error.code === '23505') return { error: 'Esa prenda ya está pedida.' }
    log.warn({ event: 'loans.request_failed', reason: error.message })
    return { error: 'No hemos podido enviar la petición.' }
  }

  track('loan_requested', user.id)
  revalidatePath('/prestamos')
  return { ok: true }
}

const decideSchema = z.object({
  loanId: z.string().uuid(),
  decision: z.enum(['accept', 'decline']),
})

/**
 * Contestar a una petición.
 *
 * Al aceptar, la prenda deja de estar disponible: el motor no debe proponerte
 * algo que está en casa de otra persona. Se guarda antes cómo estaba, porque al
 * devolverla hay que dejarla igual y no siempre estaba disponible.
 */
export async function decideLoan(formData: FormData): Promise<void> {
  const user = await requireUser()

  const parsed = decideSchema.safeParse({
    loanId: formData.get('loanId'),
    decision: formData.get('decision'),
  })
  if (!parsed.success) return

  const { loanId, decision } = parsed.data
  const admin = createAdminClient()

  const { data: loan } = await admin
    .from('loans')
    .select('id, item_id, owner_id, status')
    .eq('id', loanId)
    .maybeSingle()

  if (!loan) return
  const row = loan as { id: string; item_id: string; owner_id: string; status: string }

  // Solo el dueño, y solo si nadie ha contestado ya.
  if (row.owner_id !== user.id || row.status !== 'requested') return

  if (decision === 'decline') {
    await admin
      .from('loans')
      .update({ status: 'declined', decided_at: new Date().toISOString() })
      .eq('id', row.id)
    revalidatePath('/prestamos')
    return
  }

  const { data: item } = await admin
    .from('clothing_items')
    .select('is_available')
    .eq('id', row.item_id)
    .maybeSingle()

  const wasAvailable = (item as { is_available: boolean } | null)?.is_available ?? true

  await admin
    .from('loans')
    .update({
      status: 'accepted',
      decided_at: new Date().toISOString(),
      was_available: wasAvailable,
    })
    .eq('id', row.id)

  await admin.from('clothing_items').update({ is_available: false }).eq('id', row.item_id)

  track('loan_accepted', user.id)
  revalidatePath('/prestamos')
  revalidatePath('/armario')
}

/**
 * Devolver.
 *
 * La prenda vuelve **al estado que tenía**, no a «disponible». Si estaba
 * guardada de temporada antes de prestarla, sigue guardada al volver.
 */
export async function returnLoan(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('loanId'))
  if (!parsed.success) return

  const admin = createAdminClient()

  const { data: loan } = await admin
    .from('loans')
    .select('id, item_id, owner_id, borrower_id, status, was_available')
    .eq('id', parsed.data)
    .maybeSingle()

  if (!loan) return
  const row = loan as {
    id: string
    item_id: string
    owner_id: string
    borrower_id: string
    status: string
    was_available: boolean | null
  }

  if (row.status !== 'accepted') return
  if (user.id !== row.owner_id && user.id !== row.borrower_id) return

  await admin
    .from('loans')
    .update({ status: 'returned', returned_at: new Date().toISOString() })
    .eq('id', row.id)

  await admin
    .from('clothing_items')
    .update({ is_available: row.was_available ?? true })
    .eq('id', row.item_id)

  revalidatePath('/prestamos')
  revalidatePath('/armario')
}

/** Arrepentirse de haber pedido, mientras nadie haya contestado. */
export async function cancelLoan(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('loanId'))
  if (!parsed.success) return

  const admin = createAdminClient()

  await admin
    .from('loans')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', parsed.data)
    .eq('borrower_id', user.id)
    .eq('status', 'requested')

  revalidatePath('/prestamos')
}
