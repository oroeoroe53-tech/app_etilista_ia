import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { log } from '@/lib/observability/log'

/**
 * Los eventos caducados se borran enteros, fotos incluidas.
 *
 * Una semana después del día señalado. Las fotos de un evento las han visto
 * todas las invitadas —han salido del control de quien las subió— y a los siete
 * días de la boda no le sirven ya a nadie.
 *
 * **Primero los archivos, después las filas.** Al revés, el borrado en cascada
 * se llevaría por delante las rutas y las fotos se quedarían en Storage para
 * siempre: invisibles, imborrables y facturando.
 *
 * Sin cron, como la de votaciones: se ejecuta en `after()` cuando alguien crea
 * o cancela un evento.
 */

interface ExpiredRow {
  id: string
  event_guests: { photo_path: string | null }[]
}

export async function purgeExpiredEvents(): Promise<{ events: number }> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('events')
    .select('id, event_guests(photo_path)')
    .lt('expires_at', new Date().toISOString())
    .limit(100)

  if (error) {
    log.warn({ event: 'events.purge_query_failed', reason: error.message })
    return { events: 0 }
  }

  const rows = (data ?? []) as ExpiredRow[]
  if (rows.length === 0) return { events: 0 }

  const paths = rows
    .flatMap((row) => row.event_guests.map((g) => g.photo_path))
    .filter((p): p is string => Boolean(p))

  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(BUCKETS.eventPhotos)
      .remove(paths)

    // Si los archivos siguen ahí, las filas se quedan: son la única referencia
    // que permitirá volver a intentarlo.
    if (removeError) {
      log.warn({ event: 'events.purge_storage_failed', reason: removeError.message })
      return { events: 0 }
    }
  }

  const { error: deleteError } = await supabase
    .from('events')
    .delete()
    .in(
      'id',
      rows.map((r) => r.id),
    )

  if (deleteError) {
    log.warn({ event: 'events.purge_delete_failed', reason: deleteError.message })
    return { events: 0 }
  }

  log.info({ event: 'events.purged', count: rows.length })
  return { events: rows.length }
}

/**
 * Borrar un evento concreto con sus fotos.
 *
 * Existe aparte de la limpieza porque el orden importa y no se puede confiar en
 * que otro proceso lo arregle luego: al borrar la fila del evento, la cascada
 * se lleva las de las invitadas y con ellas las rutas de sus fotos. Después de
 * eso, nadie sabe ya qué archivos había que borrar.
 */
export async function purgeEventPhotos(eventId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('event_guests')
    .select('photo_path')
    .eq('event_id', eventId)

  const paths = ((data ?? []) as { photo_path: string | null }[])
    .map((g) => g.photo_path)
    .filter((p): p is string => Boolean(p))

  if (paths.length === 0) return

  const { error } = await supabase.storage.from(BUCKETS.eventPhotos).remove(paths)
  if (error) log.warn({ event: 'events.photo_delete_failed', reason: error.message })
}
