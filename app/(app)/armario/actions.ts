'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { checkEntitlement } from '@/lib/subscriptions/entitlements'
import { BUCKETS } from '@/lib/storage/paths'
import { rebuildStyleProfile } from '@/lib/style/rebuild'
import {
  CATEGORY_LIST, COLORS, FITS, MATERIALS, PATTERNS, SEASONS, STYLES,
} from '@/lib/wardrobe/taxonomy'

/**
 * Acciones del armario.
 *
 * Todo lo que llega de un formulario se valida contra la taxonomía antes de
 * tocar la base de datos. El RLS impide que alguien escriba en el armario ajeno,
 * pero no impide que escriba disparates en el suyo.
 */

function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as unknown as [T, ...T[]])
}

const attributesSchema = z.object({
  category: enumOf(CATEGORY_LIST),
  subcategory: z.string().trim().max(60).optional().or(z.literal('')),
  primary_color: enumOf(COLORS),
  secondary_colors: z.array(enumOf(COLORS)).max(4).default([]),
  pattern: enumOf(PATTERNS),
  fit: enumOf(FITS),
  material: enumOf(MATERIALS),
  styles: z.array(enumOf(STYLES)).max(4).default([]),
  seasons: z.array(enumOf(SEASONS)).min(1, 'Elige al menos una temporada.').max(4),
  formality: z.coerce.number().int().min(1).max(5),
  warmth: z.coerce.number().int().min(1).max(5),
  condition: z.enum(['new', 'good', 'worn', 'retired']),
  is_available: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
})

export interface ItemFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

/** Lee el formulario. Las casillas múltiples llegan repetidas, no como lista. */
function readForm(formData: FormData) {
  return {
    category: formData.get('category'),
    subcategory: formData.get('subcategory') ?? '',
    primary_color: formData.get('primary_color'),
    secondary_colors: formData.getAll('secondary_colors'),
    pattern: formData.get('pattern'),
    fit: formData.get('fit'),
    material: formData.get('material'),
    styles: formData.getAll('styles'),
    seasons: formData.getAll('seasons'),
    formality: formData.get('formality'),
    warmth: formData.get('warmth'),
    condition: formData.get('condition') ?? 'good',
    is_available: formData.get('is_available') !== 'false',
    notes: formData.get('notes') ?? '',
  }
}

function explain(error: z.ZodError): ItemFormState {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    fieldErrors[key] ??= issue.message
  }
  return { error: 'Revisa los datos marcados.', fieldErrors }
}

// ---------------------------------------------------------------------------

export async function updateItem(
  itemId: string,
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const user = await requireUser()

  const parsed = attributesSchema.safeParse(readForm(formData))
  if (!parsed.success) return explain(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('clothing_items')
    .update({
      ...parsed.data,
      subcategory: parsed.data.subcategory || null,
      notes: parsed.data.notes || null,
      // Que el usuario haya tocado la ficha es justamente la señal de verificación.
      user_verified: true,
    })
    .eq('id', itemId)

  if (error) {
    console.error('[armario] no se pudo actualizar:', error.message)
    return { error: 'No hemos podido guardar los cambios.' }
  }

  await refreshStyle(user.id)

  revalidatePath('/armario')
  revalidatePath(`/armario/${itemId}`)
  redirect(`/armario/${itemId}`)
}

export async function createItem(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const user = await requireUser()

  const permiso = await checkEntitlement(user.id, 'add_clothing_item')
  if (!permiso.allowed) {
    return {
      error: `Tu armario ha llegado al límite del plan (${permiso.used} de ${permiso.limit} prendas).`,
    }
  }

  const parsed = attributesSchema.safeParse(readForm(formData))
  if (!parsed.success) return explain(parsed.error)

  const imagePath = formData.get('image_path')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clothing_items')
    .insert({
      ...parsed.data,
      user_id: user.id,
      subcategory: parsed.data.subcategory || null,
      notes: parsed.data.notes || null,
      image_path: typeof imagePath === 'string' && imagePath ? imagePath : null,
      source: 'manual',
      // La ha creado la persona a mano: nace verificada.
      user_verified: true,
      ai_confidence: null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[armario] no se pudo crear:', error.message)
    return { error: 'No hemos podido crear la prenda.' }
  }

  await refreshStyle(user.id)

  revalidatePath('/armario')
  redirect(`/armario/${(data as { id: string }).id}`)
}

/**
 * Borrado lógico.
 *
 * La fila se queda con `deleted_at`: si se borrara de verdad, el historial de
 * uso y los outfits pasados se quedarían apuntando a nada (docs/DATABASE.md).
 * La foto sí se elimina, que es lo que ocupa.
 */
export async function deleteItem(itemId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from('clothing_items')
    .select('image_path')
    .eq('id', itemId)
    .maybeSingle()

  const { error } = await supabase
    .from('clothing_items')
    .update({ deleted_at: new Date().toISOString(), is_available: false })
    .eq('id', itemId)

  if (error) {
    console.error('[armario] no se pudo borrar:', error.message)
    return { ok: false as const, error: 'No hemos podido borrar la prenda.' }
  }

  const path = (data as { image_path: string | null } | null)?.image_path
  if (path) await supabase.storage.from(BUCKETS.clothing).remove([path])

  await refreshStyle(user.id)

  revalidatePath('/armario')
  redirect('/armario')
}

/**
 * Recalcula el perfil de estilo tras cambiar el armario.
 *
 * Va antes de cualquier `redirect()`, que lanza por diseño y cortaría lo que
 * viniera después. Y nunca propaga su error: si el perfil no se actualiza, la
 * prenda ya se guardó y eso es lo que la persona pidió.
 */
async function refreshStyle(userId: string) {
  await rebuildStyleProfile(userId).catch((err) =>
    console.error('[armario] no se pudo recalcular el perfil de estilo:', err),
  )
  revalidatePath('/estilo')
}

/** "La tengo en la lavadora" / "ya la tengo otra vez". */
export async function toggleAvailability(itemId: string, available: boolean) {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('clothing_items')
    .update({ is_available: available })
    .eq('id', itemId)

  if (error) return { ok: false as const }

  revalidatePath('/armario')
  revalidatePath(`/armario/${itemId}`)
  return { ok: true as const }
}
