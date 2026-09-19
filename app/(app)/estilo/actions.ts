'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { rebuildStyleProfile } from '@/lib/style/rebuild'
import { COLORS } from '@/lib/wardrobe/taxonomy'

/**
 * Ajustes declarados por la persona.
 *
 * Van a `user_preferences`, separadas del perfil aprendido: lo que alguien dice
 * expresamente no debe quedar sepultado por lo que el sistema deduce
 * (docs/DATABASE.md).
 */

const preferencesSchema = z.object({
  disliked_colors: z.array(z.enum(COLORS as unknown as [string, ...string[]])).max(10),
  default_formality: z.coerce.number().int().min(1).max(5).nullable(),
})

export interface PreferencesState {
  ok?: boolean
  error?: string
}

export async function savePreferences(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const user = await requireUser()

  const raw = {
    disliked_colors: formData.getAll('disliked_colors'),
    default_formality: formData.get('default_formality') || null,
  }

  const parsed = preferencesSchema.safeParse(raw)
  if (!parsed.success) return { error: 'Revisa los datos.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_preferences')
    .update(parsed.data)
    .eq('user_id', user.id)

  if (error) {
    console.error('[estilo] no se pudieron guardar las preferencias:', error.message)
    return { error: 'No hemos podido guardar los cambios.' }
  }

  revalidatePath('/estilo')
  return { ok: true }
}

/** Fuerza el recálculo del perfil. Barato: son unos cientos de filas. */
export async function refreshProfile() {
  const user = await requireUser()
  await rebuildStyleProfile(user.id)
  revalidatePath('/estilo')
  return { ok: true }
}
