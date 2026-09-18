import { createAdminClient } from '@/lib/supabase/admin'
import {
  COUNTED_FROM_TABLE,
  FEATURE_METRICS,
  limitFor,
  periodKey,
  type Feature,
  type PlanId,
} from './plans'

/**
 * Capa de permisos.
 *
 * Una única función decide qué puede hacer un usuario. La interfaz la consulta
 * para saber si enseñar un botón activo, atenuado o con invitación a Pro; el
 * servidor la consulta otra vez antes de gastar dinero de verdad.
 *
 * Nunca se duplica la lógica: si un día cambia el modelo de negocio, se cambia
 * aquí y en `plans.ts`, y toda la aplicación se entera.
 */

export interface EntitlementResult {
  allowed: boolean
  plan: PlanId
  /** Consumo actual del periodo. */
  used: number
  /** Techo del plan para esta funcionalidad. */
  limit: number
  /** Cuánto queda. Nunca negativo. */
  remaining: number
  reason?: 'limit_reached' | 'not_in_plan'
}

export async function getPlan(userId: string): Promise<PlanId> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', userId)
      .maybeSingle()

    const row = data as { plan?: string; status?: string } | null
    // Una suscripción impagada o cancelada vuelve a Free, no se queda en Pro.
    if (row?.plan === 'pro' && (row.status === 'active' || row.status === 'trialing')) {
      return 'pro'
    }
    return 'free'
  } catch {
    // Ante la duda, el plan más restrictivo.
    return 'free'
  }
}

/** Consumo actual de una funcionalidad en su periodo. */
export async function getUsedCount(
  userId: string,
  feature: Feature,
  now: Date = new Date(),
): Promise<number> {
  const supabase = createAdminClient()

  // El armario se cuenta sobre la tabla: borrar una prenda libera hueco.
  if (COUNTED_FROM_TABLE.has(feature)) {
    const { count } = await supabase
      .from('clothing_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null)
    return count ?? 0
  }

  const { metric, period } = FEATURE_METRICS[feature]
  const { data } = await supabase
    .from('usage_counters')
    .select('count')
    .eq('user_id', userId)
    .eq('period_key', periodKey(period, now))
    .eq('metric', metric)
    .maybeSingle()

  return (data as { count?: number } | null)?.count ?? 0
}

/**
 * ¿Puede este usuario hacer esto ahora mismo?
 *
 * Comprobar NO consume. Para consumir hay que llamar a `consumeEntitlement`
 * después, y solo cuando la operación haya salido bien.
 */
export async function checkEntitlement(
  userId: string,
  feature: Feature,
  now: Date = new Date(),
): Promise<EntitlementResult> {
  const plan = await getPlan(userId)
  const limit = limitFor(plan, feature)

  if (limit <= 0) {
    return { allowed: false, plan, used: 0, limit, remaining: 0, reason: 'not_in_plan' }
  }

  const used = await getUsedCount(userId, feature, now)
  const remaining = Math.max(0, limit - used)

  return {
    allowed: used < limit,
    plan,
    used,
    limit,
    remaining,
    ...(used < limit ? {} : { reason: 'limit_reached' as const }),
  }
}

/**
 * Registra consumo. Llamar DESPUÉS de que la operación haya tenido éxito:
 * un análisis que falló no debe gastarle el cupo al usuario.
 *
 * Las funcionalidades que se cuentan sobre la tabla (el armario) no llevan
 * contador: su "consumo" es la propia fila que se acaba de crear.
 */
export async function consumeEntitlement(
  userId: string,
  feature: Feature,
  amount = 1,
  now: Date = new Date(),
): Promise<void> {
  if (COUNTED_FROM_TABLE.has(feature)) return

  const { metric, period } = FEATURE_METRICS[feature]
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.rpc('increment_usage', {
      p_user_id: userId,
      p_period_key: periodKey(period, now),
      p_metric: metric,
      p_delta: amount,
    })
    if (error) console.error('[entitlements] increment_usage falló:', error.message)
  } catch (err) {
    console.error('[entitlements] increment_usage falló:', err)
  }
}

/** Atajo legible para el servidor: comprueba y lanza si no está permitido. */
export async function requireEntitlement(
  userId: string,
  feature: Feature,
): Promise<EntitlementResult> {
  const result = await checkEntitlement(userId, feature)
  if (!result.allowed) {
    throw new EntitlementError(feature, result)
  }
  return result
}

export class EntitlementError extends Error {
  constructor(
    public readonly feature: Feature,
    public readonly result: EntitlementResult,
  ) {
    super(
      result.reason === 'not_in_plan'
        ? `La funcionalidad "${feature}" no está incluida en el plan ${result.plan}.`
        : `Límite alcanzado para "${feature}": ${result.used}/${result.limit}.`,
    )
    this.name = 'EntitlementError'
  }
}
