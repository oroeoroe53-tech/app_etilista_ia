import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasSupabase } from './env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Límites del armario contra la base de datos real.
 *
 * `add_clothing_item` es la única funcionalidad que NO se mide con un contador
 * acumulado sino contando las prendas vivas (lib/subscriptions/plans.ts). La
 * razón es que borrar una prenda debe liberar hueco: un contador que solo sube
 * castigaría a quien limpia su armario.
 *
 * Eso depende de que el borrado lógico y el conteo se entiendan entre sí, y eso
 * solo se comprueba de verdad contra Postgres.
 */

let admin: SupabaseClient
let userId = ''
let entitlements: typeof import('@/lib/subscriptions/entitlements')

describe.skipIf(!hasSupabase)('límites del armario', () => {
  const itemIds: string[] = []

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    entitlements = await import('@/lib/subscriptions/entitlements')

    const { data, error } = await admin.auth.admin.createUser({
      email: `wardrobetest${Date.now()}@example.com`,
      password: `Test-${Date.now()}-x`,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    userId = data.user.id

    const { data: inserted } = await admin
      .from('clothing_items')
      .insert([
        { user_id: userId, category: 'tshirt', primary_color: 'black' },
        { user_id: userId, category: 'jeans', primary_color: 'navy' },
        { user_id: userId, category: 'sneakers', primary_color: 'white' },
      ])
      .select('id')

    for (const row of (inserted ?? []) as Array<{ id: string }>) itemIds.push(row.id)
  }, 60_000)

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
  }, 30_000)

  it('cuenta las prendas vivas del armario', async () => {
    const used = await entitlements.getUsedCount(userId, 'add_clothing_item')
    expect(used).toBe(3)
  })

  it('un usuario nuevo empieza en plan free', async () => {
    expect(await entitlements.getPlan(userId)).toBe('free')
  })

  it('con tres prendas queda margen de sobra', async () => {
    const check = await entitlements.checkEntitlement(userId, 'add_clothing_item')
    expect(check.allowed).toBe(true)
    expect(check.used).toBe(3)
    expect(check.remaining).toBe(check.limit - 3)
  })

  it('borrar una prenda libera hueco', async () => {
    await admin
      .from('clothing_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', itemIds[0])

    const used = await entitlements.getUsedCount(userId, 'add_clothing_item')
    expect(used).toBe(2)
  })

  it('la prenda borrada sigue en la tabla, no se pierde el historial', async () => {
    const { data } = await admin
      .from('clothing_items')
      .select('id, deleted_at')
      .eq('id', itemIds[0])
      .single()

    expect(data).not.toBeNull()
    expect(data?.deleted_at).not.toBeNull()
  })

  it('añadir prendas no toca el contador de análisis de IA', async () => {
    // Son cupos distintos: uno se mide sobre la tabla, el otro es mensual.
    const { data } = await admin
      .from('usage_counters')
      .select('metric')
      .eq('user_id', userId)
      .eq('metric', 'wardrobe_items')

    expect(data ?? []).toHaveLength(0)
  })

  it('el cupo de análisis empieza a cero e independiente', async () => {
    const check = await entitlements.checkEntitlement(userId, 'analyze_outfit')
    expect(check.used).toBe(0)
    expect(check.allowed).toBe(true)
  })
})
