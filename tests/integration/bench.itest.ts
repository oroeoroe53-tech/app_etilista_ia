import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { hasSupabase } from './env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Banco de pruebas.
 *
 * Mide el trabajo real de cada pantalla contra la base de datos de verdad, con
 * un armario de tamaño realista. No comprueba nada: informa.
 *
 *   npx vitest run --config vitest.integration.config.ts tests/integration/bench.itest.ts
 */

let admin: SupabaseClient
let userId = ''

const results: Array<{ what: string; ms: number; note?: string }> = []

/**
 * Vitest solo enseña lo que se imprime en los hooks cuando algo falla, así que
 * el informe se escribe directo a la salida estándar desde dentro del test.
 */
function printReport() {
  const line = '-'.repeat(66)
  const out: string[] = ['', line, '  RENDIMIENTO (mediana, armario de 80 prendas)', line]
  for (const r of results) {
    const bar = '#'.repeat(Math.min(26, Math.max(1, Math.round(r.ms / 12))))
    out.push(
      `  ${r.what.padEnd(30)} ${r.ms.toFixed(0).padStart(5)} ms  ${bar.padEnd(27)}${r.note ?? ''}`,
    )
  }
  out.push(line, '')
  process.stdout.write(`${out.join('\n')}\n`)
}

async function measure(what: string, times: number, fn: () => Promise<unknown>, note?: string) {
  // Una pasada en vacío: la primera llamada paga la conexión y el import.
  await fn()

  const samples: number[] = []
  for (let i = 0; i < times; i++) {
    const t0 = performance.now()
    await fn()
    samples.push(performance.now() - t0)
  }
  samples.sort((a, b) => a - b)
  results.push({ what, ms: samples[Math.floor(samples.length / 2)]!, note })
}

const CATS = [
  'tshirt', 'shirt', 'polo', 'sweater', 'hoodie',
  'jeans', 'chinos', 'trousers', 'shorts',
  'jacket', 'coat', 'blazer',
  'sneakers', 'shoes', 'boots',
  'belt', 'bag', 'hat',
]
const COLORS = ['black', 'white', 'grey', 'navy', 'beige', 'brown', 'green', 'red', 'blue']

describe.skipIf(!hasSupabase)('rendimiento', () => {
  beforeAll(async () => {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )

    const { data, error } = await admin.auth.admin.createUser({
      email: `bench${Date.now()}@example.com`,
      password: `Test-${Date.now()}-x`,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    userId = data.user.id

    // Armario de 80 prendas: por encima de lo normal, por debajo del techo Pro.
    const rows = Array.from({ length: 80 }, (_, i) => ({
      user_id: userId,
      category: CATS[i % CATS.length]!,
      primary_color: COLORS[i % COLORS.length]!,
      styles: ['casual', 'minimal'],
      seasons: ['spring', 'autumn', 'winter'],
      formality: (i % 5) + 1,
      warmth: (i % 5) + 1,
      image_path: `${userId}/bench-${i}.jpg`,
    }))
    await admin.from('clothing_items').insert(rows)
  }, 120_000)

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)

    const line = '─'.repeat(62)
    console.log(`\n${line}\n  RENDIMIENTO (mediana, armario de 80 prendas)\n${line}`)
    for (const r of results) {
      const bar = '█'.repeat(Math.min(28, Math.max(1, Math.round(r.ms / 12))))
      console.log(
        `  ${r.what.padEnd(34)} ${r.ms.toFixed(0).padStart(5)} ms  ${bar}${r.note ? `  ${r.note}` : ''}`,
      )
    }
    console.log(`${line}\n`)
  }, 60_000)

  it('mide las operaciones de cada pantalla', async () => {
    const persist = await import('@/lib/outfits/persist')
    const engine = await import('@/lib/outfits/engine')
    const packing = await import('@/lib/outfits/packing')
    const rebuild = await import('@/lib/style/rebuild')
    const neglected = await import('@/lib/wardrobe/neglected')
    const gaps = await import('@/lib/wardrobe/gaps')
    const profileModule = await import('@/lib/style/profile')
    const signed = await import('@/lib/storage/signed')

    // --- Red: cuánto cuesta una ida y vuelta a Supabase ---------------------
    await measure(
      'Consulta simple (1 fila)',
      8,
      async () => admin.from('profiles').select('id').eq('id', userId).maybeSingle(),
      'referencia de red',
    )

    await measure('Cargar armario (80 prendas)', 6, () =>
      persist.loadWardrobe(admin, userId),
    )

    const wardrobe = await persist.loadWardrobe(admin, userId)
    const profile = profileModule.emptyProfile()

    // --- Motor: puro cálculo, sin red --------------------------------------
    await measure(
      'Motor: 3 looks',
      12,
      async () =>
        engine.generateOutfits({
          wardrobe,
          profile,
          context: { temperatureC: 18, today: new Date() },
        }),
      'sin red',
    )

    await measure(
      'Motor: baraja de 40',
      8,
      async () =>
        engine.generateOutfits({
          wardrobe,
          profile,
          context: { today: new Date() },
          count: 40,
        }),
      'sin red',
    )

    await measure(
      'Maleta: 7 días',
      5,
      async () =>
        packing.planPacking({
          wardrobe,
          profile,
          days: Array.from({ length: 7 }, () => ({ temperatureC: 18, today: new Date() })),
        }),
      'sin red',
    )

    await measure(
      'Prendas olvidadas',
      20,
      async () => neglected.findNeglected(wardrobe as never[], new Date()),
      'sin red',
    )

    await measure(
      'Huecos del armario',
      20,
      async () => gaps.findGaps(wardrobe as never[]),
      'sin red',
    )

    // --- Operaciones con red -----------------------------------------------
    await measure('Recalcular perfil de estilo', 5, () =>
      rebuild.rebuildStyleProfile(userId),
    )

    const paths = wardrobe.slice(0, 60).map((_, i) => `${userId}/bench-${i}.jpg`)
    await measure(
      'Firmar 60 URLs de imagen',
      5,
      () => signed.signMany(admin, 'clothing-images', paths),
      'una sola petición',
    )

    // --- Conjuntos de consultas por pantalla --------------------------------
    await measure(
      'Consultas de la portada',
      5,
      () =>
        Promise.all([
          admin.from('profiles').select('display_name, onboarding_stage').eq('id', userId).maybeSingle(),
          admin.from('clothing_items').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          admin.from('outfit_photos').select('storage_path').eq('user_id', userId).limit(1),
          admin.from('clothing_items').select('image_path').eq('user_id', userId).limit(1),
          admin.from('clothing_items').select('*').eq('user_id', userId),
        ]),
      '5 en paralelo',
    )


    printReport()
    expect(results.length).toBeGreaterThan(0)
  }, 300_000)
})
