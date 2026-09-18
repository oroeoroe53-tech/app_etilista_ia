import type { SupabaseClient } from '@supabase/supabase-js'
import type { BucketName } from './paths'

/**
 * URLs firmadas para leer archivos de los buckets privados.
 *
 * Los buckets no son públicos (docs/DATABASE.md), así que toda imagen que se
 * muestre necesita una URL firmada con caducidad.
 *
 * Importante para el rendimiento: firmar de una en una en una cuadrícula de 60
 * prendas son 60 peticiones. `signMany` las pide en una sola llamada.
 */

/** Una hora. Suficiente para una sesión de uso, corto para que no se comparta. */
const DEFAULT_EXPIRY_SECONDS = 3600

export async function signOne(
  supabase: SupabaseClient,
  bucket: BucketName,
  path: string,
  expiresIn = DEFAULT_EXPIRY_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) {
    console.error(`[storage] no se pudo firmar ${bucket}/${path}:`, error.message)
    return null
  }
  return data?.signedUrl ?? null
}

/**
 * Firma varias rutas de un mismo bucket en una sola petición.
 * Devuelve un mapa ruta → URL. Las que fallen no aparecen: quien llama decide
 * qué enseñar en su lugar (normalmente un hueco, nunca un error).
 */
export async function signMany(
  supabase: SupabaseClient,
  bucket: BucketName,
  paths: readonly string[],
  expiresIn = DEFAULT_EXPIRY_SECONDS,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return result

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresIn)
  if (error) {
    console.error(`[storage] no se pudieron firmar ${unique.length} rutas:`, error.message)
    return result
  }

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl)
  }
  return result
}
