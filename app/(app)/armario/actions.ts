'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
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

/**
 * La referencia: todo opcional, y el texto vacio se guarda como null.
 *
 * `source_url` se valida como URL y ademas se le exige http/https. Sin eso, un
 * `javascript:...` guardado aqui acabaria en el `href` del boton de la ficha, y
 * tocarlo lo ejecutaria —en tu prenda y en la que ve una amiga.
 */
const blank = z.literal('').transform(() => null)

const referenceSchema = z.object({
  brand: blank.or(z.string().trim().min(1).max(60)).nullable().default(null),
  product_name: blank.or(z.string().trim().min(1).max(120)).nullable().default(null),
  reference_code: blank.or(z.string().trim().min(1).max(60)).nullable().default(null),
  brand_color: blank.or(z.string().trim().min(1).max(40)).nullable().default(null),
  size: blank.or(z.string().trim().min(1).max(20)).nullable().default(null),

  // Llega en euros desde el formulario y se guarda en centimos.
  price_cents: blank
    .or(
      z.coerce
        .number({ message: 'Escribe solo el importe.' })
        .min(0, 'No puede ser negativo.')
        .max(100000, 'Revisa el importe.')
        .transform((euros) => Math.round(euros * 100)),
    )
    .nullable()
    .default(null),

  bought_at: blank
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige una fecha.'))
    .nullable()
    .default(null),

  source_url: blank
    .or(
      z
        .string()
        .trim()
        .max(600)
        .url('Eso no parece una direccion.')
        .refine((u) => /^https?:\/\//i.test(u), 'Solo enlaces http o https.'),
    )
    .nullable()
    .default(null),
})

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
}).extend(referenceSchema.shape)

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

    brand: formData.get('brand') ?? '',
    product_name: formData.get('product_name') ?? '',
    reference_code: formData.get('reference_code') ?? '',
    brand_color: formData.get('brand_color') ?? '',
    size: formData.get('size') ?? '',
    price_cents: formData.get('price') ?? '',
    bought_at: formData.get('bought_at') ?? '',
    source_url: formData.get('source_url') ?? '',
  }
}

/**
 * De donde salio la referencia.
 *
 * Todo lo que llega por este formulario lo escribio una persona, asi que es
 * 'manual' —y cuando llegue el lector de etiquetas, corregir a mano una ficha
 * que leyo la maquina tiene que volver a marcarla como manual: deja de ser lo
 * que vio la camara y pasa a ser lo que dice su dueña.
 */
function referenceSource(
  data: z.infer<typeof referenceSchema>,
): 'manual' | null {
  const puesto =
    data.brand ?? data.product_name ?? data.reference_code ?? data.source_url
  return puesto !== null ? 'manual' : null
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
      reference_source: referenceSource(parsed.data),
      // Que el usuario haya tocado la ficha es justamente la señal de verificación.
      user_verified: true,
    })
    .eq('id', itemId)

  if (error) {
    console.error('[armario] no se pudo actualizar:', error.message)
    return { error: 'No hemos podido guardar los cambios.' }
  }

  refreshStyle(user.id)

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
      reference_source: referenceSource(parsed.data),
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

  refreshStyle(user.id)

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

  refreshStyle(user.id)

  revalidatePath('/armario')
  redirect('/armario')
}

/**
 * Recalcula el perfil de estilo tras cambiar el armario.
 *
 * Con `after()` se ejecuta **después de haber contestado**. Son unos 220 ms de
 * consultas, y hacerlos antes de responder significaba que guardar una prenda
 * tardara ese cuarto de segundo de más para actualizar algo que la persona ni
 * está mirando en ese momento.
 *
 * Nunca propaga su error: si el perfil no se actualiza, la prenda ya se guardó,
 * que es lo que se pidió. Y se corrige solo en el siguiente recálculo.
 */
function refreshStyle(userId: string) {
  after(async () => {
    try {
      await rebuildStyleProfile(userId)
      revalidatePath('/estilo')
    } catch (err) {
      console.error('[armario] no se pudo recalcular el perfil de estilo:', err)
    }
  })
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
