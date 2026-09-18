import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...filesIn(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * El motor de recomendación tiene que ser determinista *por construcción*,
 * no por buena voluntad (PLAN.md §4 y §19).
 *
 * Si alguien importa el router de IA dentro del motor, este test falla y obliga
 * a discutirlo. Es la diferencia entre una regla escrita en un documento y una
 * regla que el proyecto hace cumplir.
 */
describe('límites de arquitectura', () => {
  it('el motor de outfits no importa IA', () => {
    const offenders = filesIn(join(ROOT, 'lib', 'outfits')).filter((file) =>
      /from\s+['"]@\/lib\/ai/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  it('el perfil de estilo no importa IA', () => {
    // Las preferencias se actualizan con pesos y código, nunca con un LLM (§18).
    const offenders = filesIn(join(ROOT, 'lib', 'style')).filter((file) =>
      /from\s+['"]@\/lib\/ai/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  it('ningún componente de cliente importa el cliente admin de Supabase', () => {
    // El service role salta el RLS: si llega al navegador, se acabó la seguridad.
    const candidates = [...filesIn(join(ROOT, 'components')), ...filesIn(join(ROOT, 'app'))]

    const offenders = candidates.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes("'use client'") && /supabase\/admin/.test(source)
    })
    expect(offenders).toEqual([])
  })

  it('ningún componente de cliente lee variables de entorno secretas', () => {
    const secrets = ['SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY']
    const candidates = [...filesIn(join(ROOT, 'components')), ...filesIn(join(ROOT, 'app'))]

    const offenders = candidates.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes("'use client'") && secrets.some((s) => source.includes(s))
    })
    expect(offenders).toEqual([])
  })
})
