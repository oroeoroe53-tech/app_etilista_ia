import { z } from 'zod'

/**
 * Validación de variables de entorno.
 *
 * Dos bloques deliberadamente separados:
 *  - `publicEnv`  → se inlinea en el bundle del navegador. Solo `NEXT_PUBLIC_*`.
 *  - `serverEnv`  → contiene secretos. Lanza si se intenta leer desde el cliente.
 *
 * La validación es *perezosa*: el módulo se puede importar sin `.env.local` presente
 * (por ejemplo, para ejecutar los tests), y solo falla cuando algo lo usa de verdad,
 * con un mensaje que dice exactamente qué falta.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

const aiProvider = z.enum(['gemini', 'openai', 'mock'])

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // `mock` por defecto: arrancar el proyecto nunca debe costar dinero por accidente.
  AI_MODE: z.enum(['mock', 'production']).default('mock'),

  AI_VISION_PROVIDER: aiProvider.default('gemini'),
  AI_VISION_MODEL: z.string().min(1).default('gemini-flash-lite-latest'),
  AI_STYLIST_PROVIDER: aiProvider.default('gemini'),
  AI_STYLIST_MODEL: z.string().min(1).default('gemini-flash-lite-latest'),
  AI_IMAGE_PROVIDER: aiProvider.default('gemini'),
  AI_IMAGE_MODEL: z.string().min(1).default('gemini-image-latest'),

  // Proveedor secundario. Si se define, el router lo intenta cuando el primario
  // falla por red, clave o cuota. Opcional: sin esto no hay fallback, solo error.
  AI_VISION_FALLBACK_PROVIDER: aiProvider.optional(),
  AI_VISION_FALLBACK_MODEL: z.string().min(1).optional(),
  AI_STYLIST_FALLBACK_PROVIDER: aiProvider.optional(),
  AI_STYLIST_FALLBACK_MODEL: z.string().min(1).optional(),

  // Opcionales: solo se exigen cuando AI_MODE=production y el provider los necesita.
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
})

export type PublicEnv = z.infer<typeof publicSchema>
export type ServerEnv = z.infer<typeof serverSchema>

function explain(issues: z.ZodIssue[], scope: string): never {
  const lines = issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(
    `Variables de entorno inválidas o ausentes (${scope}):\n${lines}\n\n` +
      `Copia .env.example a .env.local y rellena los valores. Ver docs/ENVIRONMENT.md.`,
  )
}

/**
 * ¿Hay credenciales de Supabase? Sin ellas la aplicación no puede hacer nada,
 * pero tampoco debe estrellarse con un error de servidor: el proxy desvía a una
 * pantalla que explica qué falta.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

let publicCache: PublicEnv | null = null

export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache
  // Referencias literales: Next solo sustituye `process.env.NEXT_PUBLIC_X` escrito tal cual.
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  if (!parsed.success) explain(parsed.error.issues, 'público')
  publicCache = parsed.data
  return publicCache
}

let serverCache: ServerEnv | null = null

export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() se ha llamado desde el navegador. Esto expondría secretos.')
  }
  if (serverCache) return serverCache
  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) explain(parsed.error.issues, 'servidor')
  serverCache = parsed.data
  return serverCache
}

/** Solo para tests: limpia la caché entre casos. */
export function resetEnvCache() {
  publicCache = null
  serverCache = null
}
