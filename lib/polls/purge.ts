import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { log } from '@/lib/observability/log'

/**
 * Las votaciones caducadas se borran de verdad.
 *
 * Es la contrapartida de haber abierto estas fotos a gente que no es su dueña.
 * Un enlace que ha pasado por un grupo de mensajería ya no se puede retirar de
 * circulación, así que lo que se retira es el contenido: a las veinticuatro
 * horas no queda ni la fila ni el archivo.
 *
 * **Primero el archivo, después la fila.** Al revés se perdería la ruta y las
 * fotos se quedarían en Storage para siempre, invisibles y facturando.
 *
 * Sin cron: se ejecuta cuando alguien crea una votación, en `after()`, o sea
 * fuera de la respuesta. Quien usa esta función la paga para los demás, que es
 * poco elegante pero no necesita infraestructura, y el momento en que hay
 * votaciones que limpiar es exactamente el momento en que se crean votaciones.
 */

interface ExpiredRow {
  id: string
  poll_options: { storage_path: string }[]
}

export async function purgeExpiredPolls(): Promise<{ polls: number }> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('polls')
    .select('id, poll_options(storage_path)')
    .lt('expires_at', new Date().toISOString())
    .limit(200)

  if (error) {
    log.warn({ event: 'polls.purge_query_failed', reason: error.message })
    return { polls: 0 }
  }

  const rows = (data ?? []) as ExpiredRow[]
  if (rows.length === 0) return { polls: 0 }

  const paths = rows.flatMap((row) => row.poll_options.map((o) => o.storage_path)).filter(Boolean)

  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(BUCKETS.pollPhotos).remove(paths)

    // Si las fotos no se han ido, la fila se queda: es la única referencia que
    // permitirá volver a intentarlo. Mejor una fila de más que un archivo
    // huérfano que nadie sabe que existe.
    if (removeError) {
      log.warn({ event: 'polls.purge_storage_failed', reason: removeError.message })
      return { polls: 0 }
    }
  }

  const { error: deleteError } = await supabase
    .from('polls')
    .delete()
    .in(
      'id',
      rows.map((r) => r.id),
    )

  if (deleteError) {
    log.warn({ event: 'polls.purge_delete_failed', reason: deleteError.message })
    return { polls: 0 }
  }

  log.info({ event: 'polls.purged', count: rows.length })
  return { polls: rows.length }
}
