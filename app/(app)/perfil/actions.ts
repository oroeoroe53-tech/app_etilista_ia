'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, requireUser } from '@/lib/supabase/server'
import { deleteAccount } from '@/lib/account/delete'
import { log } from '@/lib/observability/log'

export interface DeleteState {
  error?: string
}

/**
 * Borrado de cuenta.
 *
 * Pide escribir el correo propio a mano. No es burocracia: es la diferencia
 * entre un gesto reversible y uno que no lo es, y conviene que cueste un poco.
 */
export async function requestAccountDeletion(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const user = await requireUser()

  const typed = String(formData.get('confirmEmail') ?? '')
    .trim()
    .toLowerCase()

  if (typed !== (user.email ?? '').toLowerCase()) {
    return { error: 'El correo no coincide. Escríbelo tal cual para confirmar.' }
  }

  log.info({ event: 'account.delete-requested', userId: user.id })

  const result = await deleteAccount(user.id)
  if (!result.ok) {
    return { error: result.error ?? 'No hemos podido eliminar la cuenta.' }
  }

  // La sesión apunta a un usuario que ya no existe: se cierra explícitamente.
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath('/', 'layout')
  redirect('/login?borrada=1')
}
