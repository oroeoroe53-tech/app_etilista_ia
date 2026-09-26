import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/observability/log'

/**
 * Control de ráfagas.
 *
 * Los límites del plan (`entitlements.ts`) responden a "cuánto puede consumir
 * esta persona al mes". Esto responde a otra pregunta distinta: "cuántas veces
 * puede pulsar el botón en un minuto".
 *
 * Hacen falta las dos. Alguien con cupo de sobra puede dispararnos cien análisis
 * en diez segundos por un script, un doble clic o un reintento mal hecho, y cada
 * uno cuesta dinero (PLAN.md §30).
 *
 * Implementación: cubos por ventana de tiempo sobre `usage_counters`, usando la
 * misma función atómica `increment_usage` que ya existe. Un contador en memoria
 * sería inútil aquí, porque cada petición puede caer en una instancia distinta
 * del servidor y cada una tendría su propia cuenta.
 */

export interface RateLimitRule {
  /** Nombre del cubo. Distintas operaciones no deben compartir cuenta. */
  bucket: string
  /** Peticiones permitidas dentro de la ventana. */
  limit: number
  /** Duración de la ventana, en segundos. */
  windowSeconds: number
}

/**
 * Reglas por operación.
 *
 * Generosas para el uso normal y estrechas para el abuso: nadie analiza sus
 * fotos cinco veces en un minuto por accidente, pero un bucle sí.
 */
export const RATE_LIMITS = {
  aiVision: { bucket: 'ai_vision', limit: 5, windowSeconds: 60 },
  aiStylist: { bucket: 'ai_stylist', limit: 15, windowSeconds: 60 },
  outfitRequest: { bucket: 'outfit_request', limit: 20, windowSeconds: 60 },
  swipe: { bucket: 'swipe', limit: 60, windowSeconds: 60 },
  upload: { bucket: 'upload', limit: 40, windowSeconds: 300 },
  // Leer un enlace saca a nuestro servidor a internet. Diez por minuto es
  // mas de lo que nadie pega a mano, y corta el bucle de un script.
  readLink: { bucket: 'read_link', limit: 10, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>

export interface RateLimitResult {
  allowed: boolean
  /** Peticiones restantes en esta ventana. */
  remaining: number
  /** Segundos que faltan para que la ventana se reinicie. */
  resetInSeconds: number
}

function windowKey(rule: RateLimitRule, now: Date): string {
  const window = Math.floor(now.getTime() / (rule.windowSeconds * 1000))
  return `rate:${window}`
}

/**
 * Consume una unidad del cubo y dice si se puede seguir.
 *
 * Si el control falla (base de datos caída, por ejemplo) **deja pasar**. Es una
 * decisión consciente: un limitador roto no debe tumbar la aplicación entera.
 * Los límites del plan siguen aplicándose por debajo, así que el gasto sigue
 * teniendo techo aunque esta capa se caiga.
 */
export async function checkRateLimit(
  userId: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const elapsed = Math.floor(now.getTime() / 1000) % rule.windowSeconds
  const resetInSeconds = rule.windowSeconds - elapsed

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('increment_usage', {
      p_user_id: userId,
      p_period_key: windowKey(rule, now),
      p_metric: rule.bucket,
      p_delta: 1,
    })

    if (error) {
      log.warn({ event: 'ratelimit.unavailable', userId, bucket: rule.bucket })
      return { allowed: true, remaining: rule.limit, resetInSeconds }
    }

    const count = Number(data ?? 0)
    const allowed = count <= rule.limit

    if (!allowed) {
      log.warn({
        event: 'ratelimit.exceeded',
        userId,
        bucket: rule.bucket,
        count,
        limit: rule.limit,
      })
    }

    return {
      allowed,
      remaining: Math.max(0, rule.limit - count),
      resetInSeconds,
    }
  } catch (error) {
    log.warn({ event: 'ratelimit.unavailable', userId, bucket: rule.bucket, error })
    return { allowed: true, remaining: rule.limit, resetInSeconds }
  }
}

/** Mensaje para la persona. Sin jerga y sin culpabilizar. */
export function rateLimitMessage(result: RateLimitResult): string {
  const seconds = Math.max(1, result.resetInSeconds)
  if (seconds <= 60) return `Vas muy rápido. Prueba otra vez en ${seconds} segundos.`
  return `Vas muy rápido. Prueba otra vez en un par de minutos.`
}
