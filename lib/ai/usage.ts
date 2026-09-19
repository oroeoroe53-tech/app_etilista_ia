import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/observability/log'
import type { AiCallMeta } from './types'

/**
 * Registro y consulta del uso de IA.
 *
 * Se escribe con service role porque el usuario no debe poder tocar su propio
 * registro de consumo (ver 0002_rls.sql).
 */

/**
 * Anota una llamada.
 *
 * **Nunca lanza.** Que falle la contabilidad no puede tumbar una funcionalidad
 * que ya ha funcionado para la persona: se avisa por log y se sigue.
 */
export async function recordAiUsage(userId: string | null, meta: AiCallMeta): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('ai_usage').insert({
      user_id: userId,
      provider: meta.provider,
      model: meta.model,
      operation: meta.operation,
      input_tokens: meta.inputTokens ?? null,
      output_tokens: meta.outputTokens ?? null,
      image_count: meta.imageCount,
      estimated_cost_usd: meta.estimatedCostUsd ?? null,
      latency_ms: meta.latencyMs,
      status: meta.status,
      error_code: meta.errorCode ?? null,
    })
    if (error) log.warn({ event: 'ai.usage-record-failed', userId, reason: error.message })

    log.info({
      event: 'ai.call',
      userId,
      provider: meta.provider,
      model: meta.model,
      operation: meta.operation,
      images: meta.imageCount,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      costUsd: meta.estimatedCostUsd,
      durationMs: meta.latencyMs,
      status: meta.status,
      errorCode: meta.errorCode,
    })
  } catch (error) {
    log.warn({ event: 'ai.usage-record-failed', userId, error })
  }
}

// ---------------------------------------------------------------------------
// Consultas de coste
// ---------------------------------------------------------------------------

export interface UsageSummary {
  calls: number
  costUsd: number
  inputTokens: number
  outputTokens: number
}

export interface UsageFilter {
  userId?: string
  operation?: string
  /** ISO 8601, inclusive. */
  from?: string
  /** ISO 8601, exclusivo. */
  before?: string
}

const EMPTY: UsageSummary = { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }

/**
 * Suma el consumo que cumpla el filtro.
 *
 * La suma la hace Postgres, no este proceso: traer diez mil filas por la red
 * para devolver cuatro números sería absurdo, y esta tabla solo crece.
 */
export async function getUsage(filter: UsageFilter = {}): Promise<UsageSummary> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('ai_usage_summary', {
      p_user_id: filter.userId ?? null,
      p_from: filter.from ?? null,
      p_before: filter.before ?? null,
      p_operation: filter.operation ?? null,
    })

    if (error) {
      log.warn({ event: 'ai.usage-query-failed', reason: error.message })
      return EMPTY
    }

    // La función devuelve una tabla de una sola fila.
    const row = (Array.isArray(data) ? data[0] : data) as
      | { calls: number | string; cost_usd: number | string; input_tokens: number | string; output_tokens: number | string }
      | undefined

    if (!row) return EMPTY

    return {
      calls: Number(row.calls ?? 0),
      costUsd: Number(row.cost_usd ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
    }
  } catch (error) {
    log.warn({ event: 'ai.usage-query-failed', error })
    return EMPTY
  }
}

/** Coste acumulado de un usuario. */
export function usageByUser(userId: string) {
  return getUsage({ userId })
}

/** Coste de un día concreto, `YYYY-MM-DD`. */
export function usageByDay(day: string, userId?: string) {
  const from = new Date(`${day}T00:00:00.000Z`)
  const before = new Date(from.getTime() + 24 * 60 * 60 * 1000)
  return getUsage({ userId, from: from.toISOString(), before: before.toISOString() })
}

/** Coste de un mes concreto, `YYYY-MM`. */
export function usageByMonth(month: string, userId?: string) {
  const [year, m] = month.split('-').map(Number)
  const from = new Date(Date.UTC(year!, m! - 1, 1))
  const before = new Date(Date.UTC(year!, m!, 1))
  return getUsage({ userId, from: from.toISOString(), before: before.toISOString() })
}

/** Coste por operación: sirve para ver qué función es la cara. */
export function usageByOperation(operation: string, userId?: string) {
  return getUsage({ userId, operation })
}
