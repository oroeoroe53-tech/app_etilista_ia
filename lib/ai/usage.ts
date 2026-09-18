import { createAdminClient } from '@/lib/supabase/admin'
import type { AiCallMeta } from './types'

/**
 * Registro de uso de IA.
 *
 * Se escribe con service role porque el usuario no debe poder tocar su propio
 * registro de consumo (ver 0002_rls.sql).
 *
 * Regla importante: **nunca lanza**. Que falle el registro contable no puede
 * tumbar una funcionalidad que ya ha funcionado para el usuario. Se avisa por log
 * y se sigue.
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
    if (error) console.error('[ai_usage] no se pudo registrar:', error.message)
  } catch (err) {
    console.error('[ai_usage] no se pudo registrar:', err)
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
  /** ISO 8601 inclusive. */
  from?: string
  /** ISO 8601 exclusivo. */
  before?: string
}

const COLUMNS = 'estimated_cost_usd, input_tokens, output_tokens'

/**
 * Suma el consumo que cumpla el filtro.
 *
 * Nota de escalado: esto trae las filas y suma en memoria, que es correcto con
 * los volúmenes del MVP. Cuando `ai_usage` crezca, se sustituye por una función
 * SQL con `sum()` sin cambiar esta firma.
 */
export async function getUsage(filter: UsageFilter = {}): Promise<UsageSummary> {
  const empty: UsageSummary = { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }

  try {
    const supabase = createAdminClient()
    let query = supabase.from('ai_usage').select(COLUMNS)

    if (filter.userId) query = query.eq('user_id', filter.userId)
    if (filter.operation) query = query.eq('operation', filter.operation)
    if (filter.from) query = query.gte('created_at', filter.from)
    if (filter.before) query = query.lt('created_at', filter.before)

    const { data, error } = await query
    if (error || !data) return empty

    const rows = data as unknown as Array<{
      estimated_cost_usd: number | string | null
      input_tokens: number | null
      output_tokens: number | null
    }>

    return rows.reduce<UsageSummary>(
      (acc, row) => ({
        calls: acc.calls + 1,
        costUsd: acc.costUsd + Number(row.estimated_cost_usd ?? 0),
        inputTokens: acc.inputTokens + (row.input_tokens ?? 0),
        outputTokens: acc.outputTokens + (row.output_tokens ?? 0),
      }),
      empty,
    )
  } catch (err) {
    console.error('[ai_usage] consulta fallida:', err)
    return empty
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
