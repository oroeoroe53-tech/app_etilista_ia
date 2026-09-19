import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasSupabase } from './env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Borrado de cuenta y control de ráfagas, contra la base de datos real.
 *
 * El borrado es lo que separa "eliminar una cuenta" de "aparentar que se ha
 * eliminado": la cascada de Postgres limpia las tablas, pero no toca Storage.
 * Este test comprueba que las fotos desaparecen de verdad (PLAN.md §37).
 */

let admin: SupabaseClient
let account: typeof import('@/lib/account/delete')
let rateLimit: typeof import('@/lib/security/rate-limit')

describe.skipIf(!hasSupabase)('borrado de cuenta', () => {
  let userId = ''

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    account = await import('@/lib/account/delete')

    const { data, error } = await admin.auth.admin.createUser({
      email: `deletetest${Date.now()}@example.com`,
      password: `Test-${Date.now()}-x`,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    userId = data.user.id

    // Datos en varias tablas y archivos en dos buckets.
    const { data: item } = await admin
      .from('clothing_items')
      .insert({ user_id: userId, category: 'tshirt', primary_color: 'black' })
      .select('id')
      .single()

    await admin.from('wear_history').insert({
      user_id: userId,
      clothing_item_id: (item as { id: string }).id,
      source: 'manual',
    })

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    await admin.storage
      .from('user-outfit-photos')
      .upload(`${userId}/foto.png`, png, { contentType: 'image/png', upsert: true })
    await admin.storage
      .from('clothing-images')
      .upload(`${userId}/prenda.png`, png, { contentType: 'image/png', upsert: true })
  }, 60_000)

  afterAll(async () => {
    // Por si el test de borrado falló a mitad.
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {})
  }, 30_000)

  it('antes de borrar hay datos y archivos', async () => {
    const leftovers = await account.findLeftovers(userId)
    expect(leftovers.files).toBe(2)
    expect(Object.keys(leftovers.rows).length).toBeGreaterThan(0)
  })

  it('el borrado elimina archivos y filas', async () => {
    const result = await account.deleteAccount(userId)

    expect(result.ok).toBe(true)
    expect(result.filesRemoved).toBe(2)
  })

  it('no queda nada: ni una foto ni una fila', async () => {
    const leftovers = await account.findLeftovers(userId)

    expect(leftovers.files).toBe(0)
    expect(leftovers.rows).toEqual({})
  })

  it('el usuario ya no existe', async () => {
    const { data } = await admin.auth.admin.getUserById(userId)
    expect(data?.user).toBeFalsy()
  })
})

describe.skipIf(!hasSupabase)('control de ráfagas', () => {
  let userId = ''

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    rateLimit = await import('@/lib/security/rate-limit')

    const { data, error } = await admin.auth.admin.createUser({
      email: `ratetest${Date.now()}@example.com`,
      password: `Test-${Date.now()}-x`,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    userId = data.user.id
  }, 60_000)

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
  }, 30_000)

  it('deja pasar mientras quede cupo en la ventana', async () => {
    const rule = { bucket: 'test_ok', limit: 3, windowSeconds: 60 }
    for (let i = 0; i < 3; i++) {
      const result = await rateLimit.checkRateLimit(userId, rule)
      expect(result.allowed).toBe(true)
    }
  })

  it('corta al superar el límite', async () => {
    const rule = { bucket: 'test_block', limit: 2, windowSeconds: 60 }
    await rateLimit.checkRateLimit(userId, rule)
    await rateLimit.checkRateLimit(userId, rule)

    const tercera = await rateLimit.checkRateLimit(userId, rule)
    expect(tercera.allowed).toBe(false)
    expect(tercera.remaining).toBe(0)
  })

  it('cada operación tiene su propia cuenta', async () => {
    // Agotar el análisis de fotos no debe impedir valorar looks.
    const uno = { bucket: 'test_a', limit: 1, windowSeconds: 60 }
    const otro = { bucket: 'test_b', limit: 1, windowSeconds: 60 }

    await rateLimit.checkRateLimit(userId, uno)
    expect((await rateLimit.checkRateLimit(userId, uno)).allowed).toBe(false)
    expect((await rateLimit.checkRateLimit(userId, otro)).allowed).toBe(true)
  })

  it('una ventana nueva empieza de cero', async () => {
    const rule = { bucket: 'test_window', limit: 1, windowSeconds: 60 }
    const ahora = new Date()
    const dentroDeUnaHora = new Date(ahora.getTime() + 3_600_000)

    await rateLimit.checkRateLimit(userId, rule, ahora)
    expect((await rateLimit.checkRateLimit(userId, rule, ahora)).allowed).toBe(false)
    expect((await rateLimit.checkRateLimit(userId, rule, dentroDeUnaHora)).allowed).toBe(true)
  })

  it('el límite de un usuario no afecta a otro', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `ratetest2${Date.now()}@example.com`,
      password: `Test-${Date.now()}-y`,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(error?.message ?? 'no se creó el usuario')
    const otroUsuario = data.user.id

    try {
      const rule = { bucket: 'test_shared', limit: 1, windowSeconds: 60 }
      await rateLimit.checkRateLimit(userId, rule)
      expect((await rateLimit.checkRateLimit(userId, rule)).allowed).toBe(false)
      expect((await rateLimit.checkRateLimit(otroUsuario, rule)).allowed).toBe(true)
    } finally {
      await admin.auth.admin.deleteUser(otroUsuario)
    }
  })

  it('las reglas configuradas son coherentes', () => {
    for (const rule of Object.values(rateLimit.RATE_LIMITS)) {
      expect(rule.limit).toBeGreaterThan(0)
      expect(rule.windowSeconds).toBeGreaterThan(0)
      expect(rule.bucket).toBeTruthy()
    }
  })
})
