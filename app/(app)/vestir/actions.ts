'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { track } from '@/lib/observability/funnel'
import { log } from '@/lib/observability/log'

/**
 * Montar un look con la ropa de otra persona.
 *
 * El permiso ya existe (nivel `style` de `wardrobe_grants`) y la política de la
 * tabla lo exige, así que aquí el trabajo es distinto del de las funciones
 * anteriores: no se trata tanto de vigilar quién puede, sino de asegurar que
 * **todas las prendas son de quien va a llevarlas**. Sin esa comprobación se
 * podría mandar un look con la ropa de una tercera persona, y quien lo recibe
 * vería fotos de un armario que no conoce.
 */

/*
 * De dos a ocho prendas.
 *
 * Dos porque un look de una prenda no es un look. Ocho porque a partir de ahí
 * ya no es una propuesta, es su armario entero devuelto.
 */
const MIN_ITEMS = 2
const MAX_ITEMS = 8

const schema = z.object({
  ownerId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(MIN_ITEMS, 'Elige al menos dos prendas.').max(MAX_ITEMS),
  note: z.string().trim().max(200).optional().or(z.literal('')),
})

export interface StyleState {
  error?: string
}

export async function sendStyledLook(
  _prev: StyleState,
  formData: FormData,
): Promise<StyleState> {
  const user = await requireUser()

  const parsed = schema.safeParse({
    ownerId: formData.get('ownerId'),
    itemIds: formData.getAll('itemIds').map(String),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa el look.' }
  }

  const { ownerId, itemIds, note } = parsed.data
  const admin = createAdminClient()

  // 1. Sigue habiendo permiso, y del nivel bueno.
  const { data: grant } = await admin
    .from('wardrobe_grants')
    .select('level')
    .eq('owner_id', ownerId)
    .eq('viewer_id', user.id)
    .eq('level', 'style')
    .maybeSingle()

  if (!grant) return { error: 'Ya no te deja montarle looks.' }

  /*
   * 2. Todas las prendas son suyas.
   *
   * Se cuentan las que cumplen las dos condiciones —de esa persona y sin
   * borrar— y se compara con las que llegaron. Si falta alguna, es que se ha
   * colado una que no era suya o que ha borrado una mientras montábamos el
   * look; en los dos casos no se manda.
   */
  const { data: owned } = await admin
    .from('clothing_items')
    .select('id')
    .eq('user_id', ownerId)
    .is('deleted_at', null)
    .in('id', itemIds)

  if ((owned ?? []).length !== itemIds.length) {
    log.warn({ event: 'styled.foreign_item_rejected' })
    return { error: 'Alguna prenda ya no está en su armario. Vuelve a montarlo.' }
  }

  const { data: look, error } = await admin
    .from('styled_looks')
    .insert({ owner_id: ownerId, stylist_id: user.id, note: note || null })
    .select('id')
    .single()

  if (error || !look) {
    log.warn({ event: 'styled.create_failed', reason: error?.message })
    return { error: 'No hemos podido mandar el look.' }
  }

  const { error: itemsError } = await admin.from('styled_look_items').insert(
    itemIds.map((itemId, index) => ({
      look_id: look.id,
      item_id: itemId,
      position: index + 1,
    })),
  )

  if (itemsError) {
    // Un look sin prendas no es nada y quien lo reciba vería un hueco.
    await admin.from('styled_looks').delete().eq('id', look.id)
    log.warn({ event: 'styled.items_failed', reason: itemsError.message })
    return { error: 'No hemos podido mandar el look.' }
  }

  track('styled_sent', user.id)
  redirect('/vestir')
}

/** Marcar como visto. Solo puede quien lo lleva: ver por otra persona no es ver. */
export async function markLookSeen(formData: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('lookId'))
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase
    .from('styled_looks')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', parsed.data)
    .eq('owner_id', user.id)
    .is('seen_at', null)

  revalidatePath('/vestir')
  revalidatePath('/')
}

/** Borrarlo. Quien lo lleva o quien lo montó. */
export async function deleteStyledLook(formData: FormData): Promise<void> {
  await requireUser()
  const parsed = z.string().uuid().safeParse(formData.get('lookId'))
  if (!parsed.success) return

  // El RLS ya limita el borrado a las dos partes, así que no hace falta
  // repetirlo: la fila de otra persona simplemente no se encuentra.
  const supabase = await createClient()
  await supabase.from('styled_looks').delete().eq('id', parsed.data)

  revalidatePath('/vestir')
}
