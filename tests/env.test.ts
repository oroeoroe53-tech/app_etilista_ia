import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { serverEnv, resetEnvCache } from '@/lib/env'

/**
 * Regresión: un `.env` real deja las variables opcionales escritas y en blanco
 * (`GEMINI_API_KEY=`). Eso llega al proceso como cadena vacía, no como ausente,
 * y hacía fallar el arranque entero con un mensaje que además despistaba, porque
 * esas claves no hacen falta en modo mock.
 */
describe('serverEnv', () => {
  const original = { ...process.env }

  beforeEach(() => {
    resetEnvCache()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  })

  afterEach(() => {
    process.env = { ...original }
    resetEnvCache()
  })

  it('trata las variables opcionales en blanco como ausentes', () => {
    process.env.GEMINI_API_KEY = ''
    process.env.OPENAI_API_KEY = '   '

    const env = serverEnv()
    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
  })

  it('tampoco se atraganta con un proveedor de fallback en blanco', () => {
    process.env.AI_VISION_FALLBACK_PROVIDER = ''
    process.env.AI_VISION_FALLBACK_MODEL = ''

    const env = serverEnv()
    expect(env.AI_VISION_FALLBACK_PROVIDER).toBeUndefined()
  })

  it('arranca en modo mock por defecto: nunca gasta dinero por accidente', () => {
    delete process.env.AI_MODE
    expect(serverEnv().AI_MODE).toBe('mock')
  })

  it('conserva los valores que sí están puestos', () => {
    process.env.GEMINI_API_KEY = 'clave-de-verdad'
    process.env.AI_MODE = 'production'

    const env = serverEnv()
    expect(env.GEMINI_API_KEY).toBe('clave-de-verdad')
    expect(env.AI_MODE).toBe('production')
  })

  it('sigue fallando si falta algo obligatorio de verdad', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => serverEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })
})
