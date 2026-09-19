import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasSupabase } from './env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * El bucle de aprendizaje, contra la base de datos real.
 *
 * Lo que importa comprobar aquí no es que se guarde una fila, sino que **el
 * perfil se mueve en la dirección correcta**: que rechazar looks rojos baje el
 * rojo, y que decir "no me gusta el color" no ensucie lo que sabemos del estilo.
 *
 * Eso recorre tres módulos (swipe → señales → perfil) y varias tablas, así que
 * un test unitario no lo cubriría del todo.
 */

let admin: SupabaseClient
let userId = ''
let rebuild: typeof import('@/lib/style/rebuild')
let profileModule: typeof import('@/lib/style/profile')

const itemIds: Record<string, string> = {}

async function addOutfitWithFeedback(
  items: string[],
  reaction: 'like' | 'love' | 'dislike' | 'skip',
  reason: string | null = null,
) {
  const { data: outfit } = await admin
    .from('outfits')
    .insert({ user_id: userId, source: 'engine', context: { from: 'test' } })
    .select('id')
    .single()

  const outfitId = (outfit as { id: string }).id

  await admin
    .from('outfit_items')
    .insert(items.map((id) => ({ outfit_id: outfitId, clothing_item_id: id, role: 'top' })))

  await admin
    .from('outfit_feedback')
    .insert({ user_id: userId, outfit_id: outfitId, reaction, reason })

  return outfitId
}

describe.skipIf(!hasSupabase)('aprendizaje por feedback', () => {
  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    rebuild = await import('@/lib/style/rebuild')
    profileModule = await import('@/lib/style/profile')

    const { data, error } = await admin.auth.admin.createUser({
      email: `swipetest${Date.now()}@example.com`,
      password: `Test-${Date.now()}-x`,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    userId = data.user.id

    const { data: created } = await admin
      .from('clothing_items')
      .insert([
        {
          user_id: userId, category: 'tshirt', primary_color: 'black',
          styles: ['minimal'], fit: 'oversized', formality: 3, warmth: 2,
          seasons: ['spring', 'summer', 'autumn', 'winter'],
        },
        {
          user_id: userId, category: 'shirt', primary_color: 'red',
          styles: ['minimal'], fit: 'oversized', formality: 3, warmth: 2,
          seasons: ['spring', 'summer', 'autumn', 'winter'],
        },
        {
          user_id: userId, category: 'jeans', primary_color: 'navy',
          styles: ['casual'], fit: 'regular', formality: 3, warmth: 3,
          seasons: ['spring', 'autumn', 'winter'],
        },
      ])
      .select('id, primary_color')

    for (const row of (created ?? []) as Array<{ id: string; primary_color: string }>) {
      itemIds[row.primary_color] = row.id
    }
  }, 60_000)

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
  }, 30_000)

  it('sin feedback, el perfil solo refleja lo que tiene', async () => {
    const profile = await rebuild.rebuildStyleProfile(userId)
    expect(profile.signalCount).toBeGreaterThan(0)
    expect(profile.color.black).toBeGreaterThan(0)
    expect(profile.color.red).toBeGreaterThan(0)
  })

  it('rechazar looks rojos baja el rojo por debajo del negro', async () => {
    for (let i = 0; i < 4; i++) {
      await addOutfitWithFeedback([itemIds.red!], 'dislike', 'color')
    }
    await addOutfitWithFeedback([itemIds.black!], 'love')

    const profile = await rebuild.rebuildStyleProfile(userId)

    expect(profile.color.red!).toBeLessThan(profile.color.black!)
    expect(profileModule.affinityOf(profile, 'color', 'red')).toBeLessThan(
      profileModule.affinityOf(profile, 'color', 'black'),
    )
  })

  it('rechazar POR EL COLOR no castiga el estilo compartido', async () => {
    // La camiseta negra y la camisa roja comparten estilo "minimal". Si el
    // motivo no se respetara, rechazar la roja hundiría también el minimalismo.
    const profile = await rebuild.rebuildStyleProfile(userId)
    expect(profile.style.minimal!).toBeGreaterThan(0)
  })

  it('"no sé" cuenta como señal vista pero no mueve nada', async () => {
    const antes = await rebuild.rebuildStyleProfile(userId)
    await addOutfitWithFeedback([itemIds.navy!], 'skip')
    const despues = await rebuild.rebuildStyleProfile(userId)

    expect(despues.signalCount).toBeGreaterThan(antes.signalCount)
    expect(despues.color.navy).toBeCloseTo(antes.color.navy!, 5)
  })

  it('el perfil guardado en la base de datos coincide con el calculado', async () => {
    const calculado = await rebuild.rebuildStyleProfile(userId)

    const { data } = await admin
      .from('style_profile')
      .select('color_weights, signal_count')
      .eq('user_id', userId)
      .single()

    const guardado = (data as { color_weights: Record<string, number>; signal_count: number })
    expect(guardado.signal_count).toBe(calculado.signalCount)
    expect(guardado.color_weights.black).toBeCloseTo(calculado.color.black!, 2)
  })

  it('opinar dos veces sobre el mismo look sustituye, no acumula', async () => {
    const outfitId = await addOutfitWithFeedback([itemIds.navy!], 'like')

    const { error } = await admin
      .from('outfit_feedback')
      .upsert(
        { user_id: userId, outfit_id: outfitId, reaction: 'dislike', reason: 'fit' },
        { onConflict: 'user_id,outfit_id' },
      )
    expect(error).toBeNull()

    const { data } = await admin
      .from('outfit_feedback')
      .select('reaction')
      .eq('outfit_id', outfitId)

    expect(data).toHaveLength(1)
    expect(data?.[0]?.reaction).toBe('dislike')
  })

  it('el bucle entero no gasta ni una llamada de IA', async () => {
    // Todo el aprendizaje es aritmética (PLAN.md §18).
    const { data } = await admin.from('ai_usage').select('id').eq('user_id', userId)
    expect(data ?? []).toHaveLength(0)
  })
})
