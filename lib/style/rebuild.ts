import { createAdminClient } from '@/lib/supabase/admin'
import { emptyProfile, toStored, type StyleProfile } from './profile'
import {
  applySignals,
  feedbackSignal,
  formalityBiasFrom,
  ownershipSignal,
  photoSignal,
  wearSignal,
  type GarmentAttributes,
  type StyleSignal,
} from './signals'

/**
 * Recalcula el perfil entero desde cero.
 *
 * Se recalcula todo en lugar de ir sumando cambios sobre lo guardado. Con los
 * volúmenes reales (cientos de filas por persona) cuesta milisegundos, y a
 * cambio el perfil **no puede desviarse**: si mañana se cambian los pesos de
 * `weights.ts`, el siguiente recálculo ya los aplica a toda la historia.
 *
 * Un sistema incremental habría que migrarlo a mano cada vez que se toque un peso.
 */

interface ItemRow {
  id: string
  styles: string[] | null
  primary_color: string
  secondary_colors: string[] | null
  fit: string | null
  formality: number | null
}

function toAttributes(row: ItemRow): GarmentAttributes {
  return {
    styles: row.styles ?? [],
    primary_color: row.primary_color,
    secondary_colors: row.secondary_colors ?? [],
    fit: row.fit ?? 'unknown',
    formality: row.formality ?? 3,
  }
}

export async function rebuildStyleProfile(userId: string): Promise<StyleProfile> {
  const supabase = createAdminClient()

  const [{ data: items }, { data: detections }, { data: history }, { data: feedback }] =
    await Promise.all([
      supabase
        .from('clothing_items')
        .select('id, styles, primary_color, secondary_colors, fit, formality')
        .eq('user_id', userId)
        .is('deleted_at', null),
      supabase.from('detected_items').select('clothing_item_id').eq('user_id', userId),
      supabase.from('wear_history').select('clothing_item_id').eq('user_id', userId),
      supabase
        .from('outfit_feedback')
        .select('outfit_id, reaction, reason')
        .eq('user_id', userId),
    ])

  const rows = (items ?? []) as unknown as ItemRow[]
  if (rows.length === 0) {
    const empty = emptyProfile()
    await persist(userId, empty)
    return empty
  }

  const byId = new Map(rows.map((row) => [row.id, toAttributes(row)]))
  const signals: StyleSignal[] = []

  // 1. Lo que tiene.
  for (const attributes of byId.values()) signals.push(ownershipSignal(attributes))

  // 2. Lo que sale en sus fotos: lo lleva de verdad, no solo lo tiene.
  const appearances = new Map<string, number>()
  for (const row of (detections ?? []) as Array<{ clothing_item_id: string | null }>) {
    if (!row.clothing_item_id) continue
    appearances.set(row.clothing_item_id, (appearances.get(row.clothing_item_id) ?? 0) + 1)
  }
  for (const [itemId, count] of appearances) {
    const attributes = byId.get(itemId)
    if (attributes) signals.push(photoSignal(attributes, count))
  }

  // 3. Lo que se ha puesto.
  const wears = new Map<string, number>()
  for (const row of (history ?? []) as Array<{ clothing_item_id: string }>) {
    wears.set(row.clothing_item_id, (wears.get(row.clothing_item_id) ?? 0) + 1)
  }
  for (const [itemId, times] of wears) {
    const attributes = byId.get(itemId)
    if (attributes) signals.push(wearSignal(attributes, times))
  }

  // 4. Lo que ha aprobado o rechazado.
  const reactions = (feedback ?? []) as Array<{
    outfit_id: string
    reaction: 'like' | 'love' | 'dislike' | 'skip'
    reason: string | null
  }>

  if (reactions.length > 0) {
    const { data: outfitItems } = await supabase
      .from('outfit_items')
      .select('outfit_id, clothing_item_id')
      .in('outfit_id', reactions.map((r) => r.outfit_id))

    const byOutfit = new Map<string, GarmentAttributes[]>()
    for (const row of (outfitItems ?? []) as Array<{
      outfit_id: string
      clothing_item_id: string
    }>) {
      const attributes = byId.get(row.clothing_item_id)
      if (!attributes) continue
      byOutfit.set(row.outfit_id, [...(byOutfit.get(row.outfit_id) ?? []), attributes])
    }

    for (const reaction of reactions) {
      const garments = byOutfit.get(reaction.outfit_id)
      if (garments?.length) {
        signals.push(feedbackSignal(garments, reaction.reaction, reason(reaction.reason)))
      }
    }
  }

  const profile = applySignals(emptyProfile(), signals)

  // La formalidad es un promedio de lo que tiene, no una acumulación, así que se
  // calcula aparte y luego se ajusta con lo que haya dicho al rechazar looks.
  const base = formalityBiasFrom([...byId.values()])
  profile.formalityBias = clamp(base + profile.formalityBias, -1, 1)

  await persist(userId, profile)
  return profile
}

function reason(value: string | null): string | null {
  return value && value.length > 0 ? value : null
}

function clamp(value: number, min: number, max: number) {
  return Number(Math.min(max, Math.max(min, value)).toFixed(3))
}

async function persist(userId: string, profile: StyleProfile) {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('style_profile')
      .update(toStored(profile))
      .eq('user_id', userId)
    if (error) console.error('[estilo] no se pudo guardar el perfil:', error.message)
  } catch (err) {
    console.error('[estilo] no se pudo guardar el perfil:', err)
  }
}
