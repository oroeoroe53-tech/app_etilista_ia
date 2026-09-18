import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Carga `.env.local` para los tests de integración.
 *
 * Los tests unitarios no tocan la red ni necesitan esto. Los de integración
 * corren contra el Supabase real, así que necesitan las credenciales de verdad.
 */
const file = resolve(import.meta.dirname, '../../.env.local')

if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

export const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
)
