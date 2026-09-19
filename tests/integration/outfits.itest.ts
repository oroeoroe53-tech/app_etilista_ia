import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasSupabase } from './env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

/**
 * "¿Qué me pongo?" contra la base de datos real.
 *
 * Lo que aquí se comprueba no se puede comprobar con tests unitarios: que el
 * armario se lee bien, que los tres looks se guardan agrupados por petición, y
 * que marcar un look como puesto actualiza el historial y los contadores.
 *
 * Eso último importa: el historial es lo que evita que la aplicación proponga
 * lo mismo un martes tras otro.
 */

let admin: SupabaseClient
let userId = ''
let persist: typeof import('@/lib/outfits/persist')
let engine: typeof import('@/lib/outfits/engine')
let profileModule: typeof import('@/lib/style/profile')

describe.skipIf(!hasSupabase)('propuesta de outfits', () => {
  const requestId = randomUUID()
  let outfitIds: string[] = []
  let wardrobe: Awaited<ReturnType<typeof persist.loadWardrobe>> = []

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    persist = await import('@/lib/outfits/persist')
    engine = await import('@/lib/outfits/engine')
    profileModule = await import('@/lib/style/profile')

    const { data, error } = await admin.auth.admin.createUser({
      email: `outfitstest${Date.now()}@example.com`,
      password: `Test-${Date.now()}-x`,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    userId = data.user.id

    await admin.from('clothing_items').insert([
      {
        user_id: userId, category: 'tshirt', primary_color: 'black',
        styles: ['minimal'], seasons: ['spring', 'summer', 'autumn', 'winter'],
        formality: 3, warmth: 2,
      },
      {
        user_id: userId, category: 'jeans', primary_color: 'navy',
        styles: ['casual'], seasons: ['spring', 'autumn', 'winter'],
        formality: 3, warmth: 3,
      },
      {
        user_id: userId, category: 'sneakers', primary_color: 'white',
        styles: ['casual', 'minimal'], seasons: ['spring', 'summer', 'autumn'],
        formality: 3, warmth: 2,
      },
      {
        user_id: userId, category: 'shirt', primary_color: 'white',
        styles: ['minimal'], seasons: ['spring', 'autumn'],
        formality: 4, warmth: 2,
      },
      {
        user_id: userId, category: 'chinos', primary_color: 'beige',
        styles: ['minimal'], seasons: ['spring', 'summer', 'autumn'],
        formality: 4, warmth: 2,
      },
    ])

    wardrobe = await persist.loadWardrobe(admin, userId)
  }, 60_000)

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
  }, 30_000)

  it('lee el armario con todos los campos que el motor necesita', () => {
    expect(wardrobe).toHaveLength(5)
    for (const item of wardrobe) {
      expect(item.category).toBeTruthy()
      expect(item.primary_color).toBeTruthy()
      expect(typeof item.formality).toBe('number')
      expect(typeof item.warmth).toBe('number')
      expect(Array.isArray(item.seasons)).toBe(true)
    }
  })

  it('el motor compone looks con ese armario', async () => {
    const result = engine.generateOutfits({
      wardrobe,
      profile: profileModule.emptyProfile(),
      context: { temperatureC: 18, today: new Date() },
    })

    expect(result.emptyReason).toBeNull()
    expect(result.outfits.length).toBeGreaterThan(0)

    outfitIds = await persist.saveOutfits(
      userId,
      requestId,
      result.outfits,
      { temperatureC: 18, occasion: 'casual' },
      result.outfits.map((_, i) => `Explicación ${i + 1}`),
    )

    expect(outfitIds.length).toBe(result.outfits.length)
  })

  it('los tres looks se recuperan juntos por su petición', async () => {
    const { data } = await admin
      .from('outfits')
      .select('id, explanation, context')
      .eq('context->>request_id', requestId)

    expect(data?.length).toBe(outfitIds.length)
    expect(data?.[0]?.explanation).toContain('Explicación')
  })

  it('guarda qué prenda ocupa cada hueco', async () => {
    const { data } = await admin
      .from('outfit_items')
      .select('outfit_id, clothing_item_id, role')
      .in('outfit_id', outfitIds)

    expect((data?.length ?? 0)).toBeGreaterThan(0)
    for (const row of data ?? []) {
      expect(['top', 'bottom', 'outer', 'footwear', 'accessory', 'full_body']).toContain(row.role)
    }
  })

  it('marcar un look como puesto alimenta el historial', async () => {
    const result = await persist.markOutfitWorn(admin, userId, outfitIds[0]!)
    expect(result.ok).toBe(true)

    const { data } = await admin
      .from('wear_history')
      .select('clothing_item_id, source')
      .eq('user_id', userId)

    expect((data?.length ?? 0)).toBeGreaterThan(0)
    expect(data?.[0]?.source).toBe('outfit')
  })

  it('y actualiza los contadores de cada prenda', async () => {
    const { data: links } = await admin
      .from('outfit_items')
      .select('clothing_item_id')
      .eq('outfit_id', outfitIds[0]!)

    const ids = (links ?? []).map((l) => l.clothing_item_id)
    const { data: items } = await admin
      .from('clothing_items')
      .select('id, times_worn, last_worn_at')
      .in('id', ids)

    for (const item of items ?? []) {
      expect(item.times_worn).toBe(1)
      expect(item.last_worn_at).not.toBeNull()
    }
  })

  it('tras ponerse un look, el motor deja descansar esas prendas', async () => {
    // Es el efecto que hace que la aplicación no proponga lo mismo cada día.
    const actualizado = await persist.loadWardrobe(admin, userId)
    const usadas = actualizado.filter((item) => item.last_worn_at !== null)

    expect(usadas.length).toBeGreaterThan(0)

    const result = engine.generateOutfits({
      wardrobe: actualizado,
      profile: profileModule.emptyProfile(),
      context: { temperatureC: 18, today: new Date() },
    })

    // O bien las evita, o bien avisa de que tuvo que relajar el descanso.
    const propuestas = new Set(result.outfits.flatMap((o) => o.items.map((i) => i.id)))
    const repetidas = usadas.filter((item) => propuestas.has(item.id))

    if (repetidas.length > 0) {
      expect(result.relaxed).toContain('recently_worn')
    }
  })

  it('generar propuestas no gasta ninguna llamada de visión', async () => {
    const { data } = await admin
      .from('ai_usage')
      .select('operation')
      .eq('user_id', userId)

    const visionCalls = (data ?? []).filter((row) => row.operation.startsWith('vision.'))
    expect(visionCalls).toHaveLength(0)
  })
})
