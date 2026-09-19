import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { log } from '@/lib/observability/log'

/**
 * Borrado de cuenta.
 *
 * Borrar de `auth.users` arrastra en cascada todas las tablas, pero **no toca
 * Storage**. Si solo se hiciera eso, las fotos de alguien que ha pedido irse se
 * quedarían en el servidor para siempre. No es un detalle de limpieza: es lo que
 * separa borrar una cuenta de aparentar que se ha borrado (PLAN.md §37).
 *
 * Orden deliberado: **primero los archivos, después el usuario**. Al revés, si
 * algo fallara a mitad, la fila ya no existiría y nadie sabría a quién pertenecen
 * los archivos que quedaron.
 */

export interface DeleteAccountResult {
  ok: boolean
  filesRemoved: number
  error?: string
}

const ALL_BUCKETS = Object.values(BUCKETS)

/** Lista todo lo que un usuario tiene en un bucket, paginando. */
async function listUserFiles(
  supabase: ReturnType<typeof createAdminClient>,
  bucket: string,
  userId: string,
): Promise<string[]> {
  const paths: string[] = []
  const pageSize = 100
  let offset = 0

  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(userId, { limit: pageSize, offset })

    if (error) {
      log.warn({ event: 'account.list-files-failed', userId, bucket })
      break
    }
    if (!data || data.length === 0) break

    for (const file of data) paths.push(`${userId}/${file.name}`)

    if (data.length < pageSize) break
    offset += pageSize
  }

  return paths
}

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const supabase = createAdminClient()
  let filesRemoved = 0

  try {
    // --- 1. Storage ------------------------------------------------------
    for (const bucket of ALL_BUCKETS) {
      const paths = await listUserFiles(supabase, bucket, userId)
      if (paths.length === 0) continue

      const { error } = await supabase.storage.from(bucket).remove(paths)
      if (error) {
        // Si no se pueden borrar los archivos, NO se borra la cuenta: es
        // preferible un error honesto a decir "hecho" dejando las fotos ahí.
        log.error({ event: 'account.delete-files-failed', userId, bucket, error })
        return {
          ok: false,
          filesRemoved,
          error: 'No hemos podido borrar tus fotos. No se ha eliminado nada.',
        }
      }
      filesRemoved += paths.length
    }

    // --- 2. Usuario y, en cascada, todas sus filas ------------------------
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      log.error({ event: 'account.delete-user-failed', userId, error })
      return { ok: false, filesRemoved, error: 'No hemos podido eliminar la cuenta.' }
    }

    log.info({ event: 'account.deleted', userId, filesRemoved })
    return { ok: true, filesRemoved }
  } catch (error) {
    log.error({ event: 'account.delete-failed', userId, error })
    return { ok: false, filesRemoved, error: 'No hemos podido eliminar la cuenta.' }
  }
}

/**
 * Comprueba que no queda nada de un usuario.
 * Lo usan los tests de integración para verificar que el borrado fue de verdad.
 */
export async function findLeftovers(userId: string): Promise<{
  files: number
  rows: Record<string, number>
}> {
  const supabase = createAdminClient()

  let files = 0
  for (const bucket of ALL_BUCKETS) {
    files += (await listUserFiles(supabase, bucket, userId)).length
  }

  const tables = [
    'profiles', 'clothing_items', 'outfit_photos', 'detected_items',
    'outfits', 'outfit_feedback', 'style_profile', 'user_preferences',
    'wear_history', 'subscriptions', 'usage_counters',
  ]

  const rows: Record<string, number> = {}
  for (const table of tables) {
    const column = table === 'profiles' ? 'id' : 'user_id'
    const { count } = await supabase
      .from(table)
      .select(column, { count: 'exact', head: true })
      .eq(column, userId)
    if ((count ?? 0) > 0) rows[table] = count!
  }

  return { files, rows }
}
