import { createClient } from '@supabase/supabase-js'

/**
 * Verificación de seguridad contra el proyecto real de Supabase.
 *
 * Las políticas de RLS son fáciles de escribir mal de forma sutil, y un fallo no
 * se nota mirando la pantalla: se nota cuando un usuario ve la ropa de otro
 * (PLAN.md §9, riesgo 6).
 *
 * Este script crea dos usuarios de prueba, comprueba que ninguno puede ver los
 * datos del otro, y los borra al terminar. No deja rastro.
 *
 *   node --env-file=.env.local scripts/verify-rls.mjs
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON || !SERVICE) {
  console.error('Faltan variables de Supabase en .env.local')
  process.exit(1)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  OK  ' : ' FALLO'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const TABLES = [
  'profiles', 'clothing_items', 'outfit_photos', 'detected_items',
  'outfits', 'outfit_items', 'outfit_feedback', 'style_profile',
  'user_preferences', 'wear_history', 'ai_usage', 'subscriptions',
  'usage_counters',
]

const created = []

async function makeUser(tag) {
  const email = `rlstest+${tag}${Date.now()}@example.com`
  const password = `Test-${Math.random().toString(36).slice(2)}-${Date.now()}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Prueba ${tag}` },
  })
  if (error) throw new Error(`no se pudo crear el usuario ${tag}: ${error.message}`)
  created.push(data.user.id)
  return { id: data.user.id, email, password }
}

async function main() {
  console.log('\n--- Tablas ---')
  for (const table of TABLES) {
    const { error } = await admin.from(table).select('*').limit(1)
    check(`tabla ${table}`, !error, error?.message ?? '')
  }

  console.log('\n--- Buckets ---')
  const res = await fetch(`${URL}/storage/v1/bucket`, {
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  })
  const buckets = await res.json()
  const expected = ['user-outfit-photos', 'clothing-images', 'generated-images', 'avatars']
  for (const name of expected) {
    const bucket = Array.isArray(buckets) ? buckets.find((b) => b.id === name) : null
    check(`bucket ${name} existe y es privado`, Boolean(bucket) && bucket.public === false,
      bucket ? (bucket.public ? 'ES PUBLICO' : '') : 'no existe')
  }

  console.log('\n--- Alta de usuario ---')
  const alice = await makeUser('a')
  const bob = await makeUser('b')

  for (const table of ['profiles', 'subscriptions', 'style_profile', 'user_preferences']) {
    const column = table === 'profiles' ? 'id' : 'user_id'
    const { data } = await admin.from(table).select(column).eq(column, alice.id)
    check(`el trigger creó la fila en ${table}`, (data?.length ?? 0) === 1)
  }

  const { data: sub } = await admin.from('subscriptions').select('plan').eq('user_id', alice.id).single()
  check('el usuario nuevo empieza en plan free', sub?.plan === 'free', sub?.plan ?? '')

  console.log('\n--- Aislamiento entre usuarios ---')
  const { data: item, error: itemError } = await admin
    .from('clothing_items')
    .insert({ user_id: alice.id, category: 'tshirt', primary_color: 'black' })
    .select('id')
    .single()
  check('se puede crear una prenda', !itemError, itemError?.message ?? '')

  // Bob inicia sesión de verdad y usa la clave pública, igual que el navegador.
  const asBob = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: signInError } = await asBob.auth.signInWithPassword({
    email: bob.email,
    password: bob.password,
  })
  check('el segundo usuario puede iniciar sesión', !signInError, signInError?.message ?? '')

  const { data: stolen } = await asBob.from('clothing_items').select('id')
  check('Bob NO ve la ropa de Alice', (stolen?.length ?? 0) === 0,
    stolen?.length ? `ve ${stolen.length} prendas ajenas` : '')

  const { data: directo } = await asBob.from('clothing_items').select('id').eq('id', item?.id ?? '')
  check('Bob NO puede leer la prenda ni sabiendo su id', (directo?.length ?? 0) === 0)

  const { data: perfiles } = await asBob.from('profiles').select('id')
  check('Bob solo ve su propio perfil', (perfiles?.length ?? 0) === 1,
    `ve ${perfiles?.length ?? 0}`)

  console.log('\n--- Escrituras que el usuario NO debe poder hacer ---')
  const { error: upgradeError } = await asBob
    .from('subscriptions')
    .update({ plan: 'pro' })
    .eq('user_id', bob.id)
  const { data: planDespues } = await admin
    .from('subscriptions').select('plan').eq('user_id', bob.id).single()
  check('Bob NO puede ascenderse a Pro', planDespues?.plan === 'free',
    upgradeError ? '' : `plan quedó en ${planDespues?.plan}`)

  const { error: usageError } = await asBob
    .from('ai_usage')
    .insert({ user_id: bob.id, provider: 'fake', model: 'fake', operation: 'fake' })
  check('Bob NO puede escribir en ai_usage', Boolean(usageError))

  const { error: counterError } = await asBob
    .from('usage_counters')
    .insert({ user_id: bob.id, period_key: 'all', metric: 'hack', count: -999 })
  check('Bob NO puede tocar sus contadores de uso', Boolean(counterError))

  console.log('\n--- Contador atómico ---')
  const { data: c1 } = await admin.rpc('increment_usage', {
    p_user_id: alice.id, p_period_key: 'test', p_metric: 'demo', p_delta: 1,
  })
  const { data: c2 } = await admin.rpc('increment_usage', {
    p_user_id: alice.id, p_period_key: 'test', p_metric: 'demo', p_delta: 2,
  })
  check('increment_usage acumula', c1 === 1 && c2 === 3, `${c1} → ${c2}`)
}

try {
  await main()
} catch (err) {
  console.error('\nError durante la verificación:', err.message)
} finally {
  for (const id of created) {
    await admin.auth.admin.deleteUser(id)
  }
  if (created.length) console.log(`\nLimpieza: ${created.length} usuarios de prueba borrados.`)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`)
  if (failed.length) {
    console.log('\nFALLOS:')
    for (const f of failed) console.log(`  · ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
    process.exit(1)
  }
}
