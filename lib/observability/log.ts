/**
 * Registro estructurado.
 *
 * Los logs se escriben como JSON en una sola línea porque así los agrupa y
 * filtra cualquier visor (el de Vercel incluido). Un `console.log` con texto
 * libre se lee bien en tu terminal y es inservible cuando hay diez mil líneas.
 *
 * Regla firme (PLAN.md §36 y §37): **aquí no entra nada personal**. Ni correos,
 * ni nombres, ni rutas de fotos, ni el contenido de lo que devuelve un modelo.
 * Identificadores sí, porque no dicen nada por sí solos y permiten seguir el
 * rastro de un problema concreto.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  /** Qué ha pasado, en kebab-case: `ai.call`, `onboarding.analyze`, `account.delete`. */
  event: string
  /** Identificador del usuario. Es un uuid: no revela quién es. */
  userId?: string | null
  durationMs?: number
  /** Cualquier otro dato NO personal. */
  [key: string]: unknown
}

/** Campos que nunca deben salir en un log, por si alguien los cuela sin querer. */
const FORBIDDEN = new Set([
  'email', 'password', 'token', 'apiKey', 'api_key', 'key', 'secret',
  'displayName', 'display_name', 'imagePath', 'image_path', 'storagePath',
  'storage_path', 'text', 'prompt', 'raw',
])

function sanitize(fields: LogFields): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN.has(key)) {
      clean[key] = '[omitido]'
      continue
    }
    // Los objetos anidados se resumen: un log no es un volcado de memoria.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = '[objeto]'
      continue
    }
    clean[key] = value
  }
  return clean
}

function write(level: Level, fields: LogFields) {
  const line = JSON.stringify({
    level,
    at: new Date().toISOString(),
    ...sanitize(fields),
  })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  debug: (fields: LogFields) => {
    if (process.env.NODE_ENV !== 'production') write('debug', fields)
  },
  info: (fields: LogFields) => write('info', fields),
  warn: (fields: LogFields) => write('warn', fields),

  /**
   * Error. Se registra el mensaje y el tipo, nunca la traza completa: puede
   * arrastrar valores de variables, y entre ellas hay claves y rutas de fotos.
   */
  error: (fields: LogFields & { error?: unknown }) => {
    const { error, ...rest } = fields
    write('error', {
      ...rest,
      errorMessage: error instanceof Error ? error.message : String(error ?? ''),
      errorType: error instanceof Error ? error.name : typeof error,
    })
  },
}

/**
 * Mide cuánto tarda algo y lo registra, pase lo que pase.
 * Devuelve lo que devuelva la función; si lanza, lo vuelve a lanzar tras registrarlo.
 */
export async function timed<T>(
  event: string,
  fields: Omit<LogFields, 'event'>,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  try {
    const result = await fn()
    log.info({ event, ...fields, durationMs: Date.now() - started, ok: true })
    return result
  } catch (error) {
    log.error({ event, ...fields, durationMs: Date.now() - started, ok: false, error })
    throw error
  }
}
