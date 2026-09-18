import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '@/lib/env'

/**
 * Cliente con service role. **Salta el RLS por completo.**
 *
 * Usar exclusivamente para operaciones del sistema que el usuario no puede hacer
 * por sí mismo:
 *   · escribir en `ai_usage` y `usage_counters` (si el usuario pudiera escribir ahí,
 *     podría falsear su propio consumo y saltarse los límites)
 *   · jobs de análisis en segundo plano
 *   · borrado de cuenta en cascada
 *
 * Nunca importar desde un componente cliente. Toda consulta hecha con este cliente
 * debe filtrar por `user_id` a mano, porque aquí no hay red de seguridad.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() se ha llamado desde el navegador.')
  }
  const pub = publicEnv()
  const srv = serverEnv()

  return createSupabaseClient(pub.NEXT_PUBLIC_SUPABASE_URL, srv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
