import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasSupabase } from './env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

/**
 * Onboarding de extremo a extremo, contra el Supabase real y en modo mock.
 *
 * Crea un usuario, le sube seis fotos, ejecuta el análisis completo y comprueba
 * que el armario queda como debe. Limpia todo al terminar: el borrado del
 * usuario arrastra sus filas en cascada, y los archivos de Storage se quitan a
 * mano porque el borrado de auth no los toca.
 *
 *   npm run verify:onboarding
 */

let admin: SupabaseClient
let userId = ''
const uploaded: string[] = []
let analyze: typeof import('@/lib/onboarding/analyze')

/** Foto sintética con dos bloques de color, para que el recorte tenga algo que cortar. */
async function fakePhoto(seed: number): Promise<Buffer> {
  const hue = (seed * 47) % 360
  const svg = `<svg width="900" height="1200">
    <rect x="180" y="140" width="520" height="420" fill="hsl(${hue} 50% 45%)"/>
    <rect x="240" y="600" width="400" height="450" fill="hsl(${(hue + 60) % 360} 40% 35%)"/>
  </svg>`

  return sharp({
    create: { width: 900, height: 1200, channels: 3, background: { r: 24, g: 28, b: 36 } },
  })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 80 })
    .toBuffer()
}

describe.skipIf(!hasSupabase)('onboarding de extremo a extremo', () => {
  let result: Awaited<ReturnType<typeof analyze.analyzePendingPhotos>>

  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    analyze = await import('@/lib/onboarding/analyze')

    const { data, error } = await admin.auth.admin.createUser({
      email: `onbtest${Date.now()}@example.com`,
      password: `Test-${Date.now()}-x`,
      email_confirm: true,
      user_metadata: { display_name: 'Prueba onboarding' },
    })
    if (error) throw new Error(error.message)
    userId = data.user.id

    for (let i = 0; i < 6; i++) {
      const path = `${userId}/test-${i}.jpg`
      const { error: upErr } = await admin.storage
        .from('user-outfit-photos')
        .upload(path, await fakePhoto(i), { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw new Error(`subida ${i}: ${upErr.message}`)
      uploaded.push(path)
    }

    await admin.from('outfit_photos').insert(
      uploaded.map((storage_path) => ({
        user_id: userId,
        storage_path,
        analysis_status: 'pending' as const,
      })),
    )

    result = await analyze.analyzePendingPhotos(userId)
  }, 120_000)

  afterAll(async () => {
    if (!userId) return
    const { data: thumbs } = await admin.storage.from('clothing-images').list(userId)
    if (thumbs?.length) {
      await admin.storage.from('clothing-images').remove(thumbs.map((t) => `${userId}/${t.name}`))
    }
    if (uploaded.length) await admin.storage.from('user-outfit-photos').remove(uploaded)
    await admin.auth.admin.deleteUser(userId)
  }, 60_000)

  it('procesa las seis fotos', () => {
    expect(result.photosAnalyzed).toBe(6)
  })

  it('crea prendas en el armario', () => {
    expect(result.itemsCreated).toBeGreaterThan(0)
  })

  it('deja todas las fotos en estado done', async () => {
    const { data } = await admin
      .from('outfit_photos')
      .select('analysis_status')
      .eq('user_id', userId)
    expect(data?.every((p) => p.analysis_status === 'done')).toBe(true)
  })

  it('recorta una miniatura para cada prenda', async () => {
    const { data } = await admin
      .from('clothing_items')
      .select('id, image_path')
      .eq('user_id', userId)
    expect(data?.length).toBeGreaterThan(0)
    expect(data?.every((i) => Boolean(i.image_path))).toBe(true)
  })

  it('no da por verificada ninguna prenda: eso lo hace el usuario', async () => {
    const { data } = await admin
      .from('clothing_items')
      .select('user_verified')
      .eq('user_id', userId)
    expect(data?.every((i) => i.user_verified === false)).toBe(true)
  })

  it('guarda la lectura cruda del modelo para poder reprocesar sin volver a llamar', async () => {
    const { data } = await admin
      .from('detected_items')
      .select('garment_group')
      .eq('user_id', userId)
    expect(data?.length).toBeGreaterThan(0)
  })

  it('agrupa las repeticiones: menos prendas que apariciones', async () => {
    const { data } = await admin
      .from('detected_items')
      .select('garment_group')
      .eq('user_id', userId)
    const grupos = new Set(data?.map((d) => d.garment_group))
    expect(grupos.size).toBeLessThan(data!.length)
  })

  it('hace UNA sola llamada de IA con las seis imágenes', async () => {
    const { data } = await admin
      .from('ai_usage')
      .select('operation, image_count, estimated_cost_usd')
      .eq('user_id', userId)

    expect(data).toHaveLength(1)
    expect(data?.[0]?.operation).toBe('vision.analyzeOutfitBatch')
    expect(data?.[0]?.image_count).toBe(6)
    expect(Number(data?.[0]?.estimated_cost_usd)).toBe(0) // modo mock
  })

  it('descuenta un análisis del cupo del plan', async () => {
    const { data } = await admin
      .from('usage_counters')
      .select('metric, count')
      .eq('user_id', userId)
      .eq('metric', 'ai_analyses')
      .maybeSingle()
    expect(data?.count).toBe(1)
  })

  it('avanza el estado del onboarding', async () => {
    const { data } = await admin
      .from('profiles')
      .select('onboarding_stage')
      .eq('id', userId)
      .single()
    expect(['review', 'completed']).toContain(data?.onboarding_stage)
  })
})
