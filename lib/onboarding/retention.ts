import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { log } from '@/lib/observability/log'

/**
 * Borrar las fotos originales cuando ya han hecho su trabajo.
 *
 * Las fotos del onboarding son de una persona vestida —selfies de espejo, con
 * cara— y existen para una sola cosa: que el modelo de visión lea qué prendas
 * hay. En cuanto el armario está montado, de cada prenda queda su recorte, y
 * ese recorte es lo único que la aplicación vuelve a mirar.
 *
 * A partir de ahí, conservar los originales no mejora el producto en nada y sí
 * empeora tres cosas: lo que se perdería en una brecha, lo que hay que
 * justificar ante el RGPD, y la factura de almacenamiento.
 *
 * Se conserva la fila, no la imagen. Sigue constando que hubo un análisis,
 * cuándo, y qué se dedujo en él: se puede seguir explicando de dónde salió
 * cada prenda sin guardar la cara de nadie.
 *
 * Nunca lanza. Si Storage falla, la limpieza se reintentará la próxima vez —
 * la consulta busca todo lo pendiente, no solo lo de hoy.
 */

interface PhotoRow {
  id: string
  storage_path: string | null
}

export interface PurgeResult {
  deleted: number
}

export async function purgeOriginalPhotos(userId: string): Promise<PurgeResult> {
  const supabase = createAdminClient()

  /*
   * Todo lo analizado y todavía sin limpiar, no solo lo de esta sesión. Así, la
   * primera vez que alguien termine un onboarding después de esto, también se
   * lleva por delante lo que subió meses atrás.
   */
  const { data, error } = await supabase
    .from('outfit_photos')
    .select('id, storage_path')
    .eq('user_id', userId)
    .eq('analysis_status', 'done')
    .is('purged_at', null)

  if (error) {
    log.warn({ event: 'retention.query_failed', reason: error.message })
    return { deleted: 0 }
  }

  const rows = (data ?? []) as PhotoRow[]
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p))

  if (rows.length === 0) return { deleted: 0 }

  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(BUCKETS.outfitPhotos)
      .remove(paths)

    /*
     * Si los archivos no se han podido borrar, NO se marcan como limpiados.
     * Marcarlos sería decir que ya no existen cuando siguen ahí, y perder para
     * siempre la referencia que permitiría borrarlos más adelante.
     */
    if (removeError) {
      log.warn({ event: 'retention.storage_failed', reason: removeError.message })
      return { deleted: 0 }
    }
  }

  const { error: markError } = await supabase
    .from('outfit_photos')
    .update({ purged_at: new Date().toISOString(), storage_path: null })
    .in(
      'id',
      rows.map((r) => r.id),
    )

  if (markError) {
    log.warn({ event: 'retention.mark_failed', reason: markError.message })
    return { deleted: 0 }
  }

  log.info({ event: 'retention.purged', count: rows.length })
  return { deleted: rows.length }
}
