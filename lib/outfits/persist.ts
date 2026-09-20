import { layerOf } from '@/lib/wardrobe/taxonomy'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nameOutfit } from './name'
import type { OutfitContext, ScoredOutfit, WardrobeItem } from './types'

/**
 * Puente entre el motor y la base de datos.
 *
 * El motor es una función pura que no sabe que Supabase existe. Aquí se le
 * traen los datos y se guardan los resultados, para que siga siendo
 * comprobable con tests sin levantar nada.
 */

interface ItemRow {
  id: string
  category: string
  primary_color: string
  secondary_colors: string[] | null
  pattern: string | null
  fit: string | null
  material: string | null
  styles: string[] | null
  seasons: string[] | null
  formality: number | null
  warmth: number | null
  is_available: boolean
  last_worn_at: string | null
  times_worn: number | null
}

const ITEM_COLUMNS =
  'id, category, primary_color, secondary_colors, pattern, fit, material, styles, seasons, formality, warmth, is_available, last_worn_at, times_worn'

function toWardrobeItem(row: ItemRow): WardrobeItem {
  return {
    id: row.id,
    category: row.category as WardrobeItem['category'],
    primary_color: row.primary_color as WardrobeItem['primary_color'],
    secondary_colors: (row.secondary_colors ?? []) as WardrobeItem['secondary_colors'],
    pattern: (row.pattern ?? 'solid') as WardrobeItem['pattern'],
    fit: (row.fit ?? 'unknown') as WardrobeItem['fit'],
    material: (row.material ?? 'unknown') as WardrobeItem['material'],
    styles: (row.styles ?? []) as WardrobeItem['styles'],
    seasons: (row.seasons ?? []) as WardrobeItem['seasons'],
    formality: row.formality ?? 3,
    warmth: row.warmth ?? 3,
    is_available: row.is_available,
    last_worn_at: row.last_worn_at,
    times_worn: row.times_worn ?? 0,
  }
}

export async function loadWardrobe(
  supabase: SupabaseClient,
  userId: string,
): Promise<WardrobeItem[]> {
  const { data } = await supabase
    .from('clothing_items')
    .select(ITEM_COLUMNS)
    .eq('user_id', userId)
    .is('deleted_at', null)

  return ((data ?? []) as unknown as ItemRow[]).map(toWardrobeItem)
}

/**
 * Guarda los looks propuestos.
 *
 * Los tres comparten un `request_id` dentro de `context`. Así se recuperan
 * juntos sin añadir una tabla de "sesión de propuesta" que solo existiría para
 * agrupar tres filas.
 */
export async function saveOutfits(
  userId: string,
  requestId: string,
  outfits: readonly ScoredOutfit[],
  context: OutfitContext,
  explanations: readonly string[] = [],
  /** Campos extra que se guardan junto al contexto (p. ej. la marca del día). */
  extraContext: Record<string, unknown> = {},
): Promise<string[]> {
  const supabase = createAdminClient()

  const rows = outfits.map((outfit, index) => ({
    user_id: userId,
    source: 'engine' as const,
    context: {
      request_id: requestId,
      position: index,
      occasion: context.occasion ?? null,
      formality: context.formality ?? null,
      temperature_c: context.temperatureC ?? null,
      rain: context.rain ?? false,
      season: context.season ?? null,
      highlights: outfit.highlights,
      /*
       * El titular se calcula y se guarda aquí, una sola vez, para todos los
       * looks vengan de donde vengan. Si cada pantalla lo dedujera por su
       * cuenta, el mismo look podría llamarse de dos maneras distintas según
       * desde dónde se mire.
       */
      title: nameOutfit(outfit.items),
      ...extraContext,
    },
    score: outfit.score,
    score_breakdown: outfit.breakdown,
    explanation: explanations[index] || null,
  }))

  const { data, error } = await supabase.from('outfits').insert(rows).select('id')
  if (error || !data) {
    console.error('[outfits] no se pudieron guardar:', error?.message)
    return []
  }

  const ids = (data as Array<{ id: string }>).map((row) => row.id)

  const itemRows = outfits.flatMap((outfit, index) =>
    outfit.items.map((item) => ({
      outfit_id: ids[index]!,
      clothing_item_id: item.id,
      role: layerOf(item.category),
    })),
  )

  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase.from('outfit_items').insert(itemRows)
    if (itemsError) console.error('[outfits] no se pudieron guardar las prendas:', itemsError.message)
  }

  return ids
}

/**
 * Registra que un look se ha llevado puesto.
 *
 * Alimenta `wear_history`, que es lo que permite no repetir siempre lo mismo y
 * detectar la chaqueta que lleva diez días sin salir del armario (PLAN.md §26).
 */
export async function markOutfitWorn(
  supabase: SupabaseClient,
  userId: string,
  outfitId: string,
  wornOn: Date = new Date(),
): Promise<{ ok: boolean }> {
  const { data } = await supabase
    .from('outfit_items')
    .select('clothing_item_id')
    .eq('outfit_id', outfitId)

  const itemIds = ((data ?? []) as Array<{ clothing_item_id: string }>).map(
    (row) => row.clothing_item_id,
  )
  if (itemIds.length === 0) return { ok: false }

  const date = wornOn.toISOString().slice(0, 10)

  const { error } = await supabase.from('wear_history').insert(
    itemIds.map((clothing_item_id) => ({
      user_id: userId,
      outfit_id: outfitId,
      clothing_item_id,
      source: 'outfit' as const,
      worn_on: date,
    })),
  )
  if (error) {
    console.error('[outfits] no se pudo registrar el uso:', error.message)
    return { ok: false }
  }

  // Los contadores de la prenda se actualizan con service role: son datos
  // derivados, y así no dependen de que el cliente los mande bien.
  const admin = createAdminClient()
  for (const id of itemIds) {
    const { data: current } = await admin
      .from('clothing_items')
      .select('times_worn')
      .eq('id', id)
      .maybeSingle()

    await admin
      .from('clothing_items')
      .update({
        times_worn: ((current as { times_worn: number } | null)?.times_worn ?? 0) + 1,
        last_worn_at: date,
      })
      .eq('id', id)
  }

  return { ok: true }
}
