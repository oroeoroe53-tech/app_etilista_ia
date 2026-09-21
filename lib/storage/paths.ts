/**
 * Rutas de Storage.
 *
 * Las políticas de 0003_storage.sql comprueban que la PRIMERA carpeta de la ruta
 * sea el uid del usuario. Si alguien construye una ruta a mano y se salta esa
 * convención, el archivo deja de estar aislado.
 *
 * Por eso las rutas se construyen solo aquí.
 */

export const BUCKETS = {
  outfitPhotos: 'user-outfit-photos',
  clothing: 'clothing-images',
  generated: 'generated-images',
  avatars: 'avatars',
  pollPhotos: 'poll-photos',
  eventPhotos: 'event-photos',
} as const

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS]

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/heic':
    case 'image/heif':
      return 'heic'
    default:
      return 'jpg'
  }
}

/** Identificador corto, ordenable por tiempo y sin colisiones prácticas. */
function token(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function outfitPhotoPath(userId: string, mimeType: string): string {
  return `${userId}/${token()}.${extensionFor(mimeType)}`
}

/** Copia reducida que se envía al modelo de visión. Vive junto a la original. */
export function outfitPhotoOptimizedPath(originalPath: string): string {
  const dot = originalPath.lastIndexOf('.')
  const base = dot === -1 ? originalPath : originalPath.slice(0, dot)
  return `${base}.ai.jpg`
}

export function clothingImagePath(userId: string, itemId: string): string {
  return `${userId}/${itemId}.jpg`
}

export function generatedImagePath(userId: string, outfitId: string): string {
  return `${userId}/${outfitId}-${token()}.png`
}

/**
 * Foto de una opción de votación.
 *
 * Vive en su propio bucket porque tiene otra vida que el resto: se enseña a
 * gente que no es su dueña y se borra sola a las veinticuatro horas. La carpeta
 * sigue siendo el uid de quien la sube, como en todos los demás.
 */
export function pollPhotoPath(userId: string, mimeType: string): string {
  return `${userId}/${token()}.${extensionFor(mimeType)}`
}

/**
 * Foto del look que alguien piensa ponerse en un evento.
 *
 * Bucket propio, como las de votación y por lo mismo: la ven personas que no
 * son su dueña y se borran solas una semana después del evento.
 */
export function eventPhotoPath(userId: string, mimeType: string): string {
  return `${userId}/${token()}.${extensionFor(mimeType)}`
}

export function avatarPath(userId: string, mimeType: string): string {
  return `${userId}/avatar.${extensionFor(mimeType)}`
}

/** Comprueba que una ruta pertenece al usuario. Defensa extra sobre el RLS. */
export function pathBelongsTo(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`)
}
