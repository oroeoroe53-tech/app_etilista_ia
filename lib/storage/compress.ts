import { UPLOAD_RULES } from '@/lib/subscriptions/plans'

/**
 * Compresión en el navegador, ANTES de subir.
 *
 * Hacerlo aquí y no en el servidor ahorra tres cosas a la vez: datos móviles del
 * usuario, tiempo de función en Vercel y almacenamiento en Supabase. Un móvil
 * actual produce fotos de 4–8 MB que no aportan nada para identificar ropa
 * (PLAN.md §6).
 *
 * Efecto secundario importante: al redibujar en un canvas se pierden los metadatos
 * EXIF, que incluyen la GEOLOCALIZACIÓN. No queremos subir dónde vive la persona
 * junto a la foto de su armario (PLAN.md §37).
 */

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
  mimeType: string
}

function readAsImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se ha podido leer la imagen.'))
    }
    img.src = url
  })
}

function scaleToFit(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const ratio = maxEdge / longest
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

/**
 * Reduce y recomprime. Si algo falla (formato raro, canvas bloqueado), devuelve
 * el archivo original: es preferible subir de más que impedir el onboarding.
 */
export async function compressImage(
  file: File,
  maxEdge: number = UPLOAD_RULES.clientMaxEdge,
  quality: number = UPLOAD_RULES.clientQuality,
): Promise<CompressedImage> {
  try {
    const img = await readAsImage(file)
    const { width, height } = scaleToFit(img.naturalWidth, img.naturalHeight, maxEdge)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas no disponible')

    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('toBlob devolvió null')

    // Si comprimir no mejora nada (foto ya pequeña), nos quedamos con la original.
    if (blob.size >= file.size && img.naturalWidth <= maxEdge) {
      return {
        blob: file,
        width: img.naturalWidth,
        height: img.naturalHeight,
        mimeType: file.type || 'image/jpeg',
      }
    }

    return { blob, width, height, mimeType: 'image/jpeg' }
  } catch {
    return { blob: file, width: 0, height: 0, mimeType: file.type || 'image/jpeg' }
  }
}

/** Validación previa. El bucket la repite en el servidor; esto es solo para avisar antes. */
export function validateUpload(file: File): { ok: true } | { ok: false; error: string } {
  const accepted: readonly string[] = UPLOAD_RULES.acceptedMimeTypes
  if (!accepted.includes(file.type)) {
    return { ok: false, error: 'Formato no admitido. Usa JPG, PNG o WEBP.' }
  }
  if (file.size > UPLOAD_RULES.maxBytes) {
    const mb = Math.round(UPLOAD_RULES.maxBytes / 1024 / 1024)
    return { ok: false, error: `La imagen supera ${mb} MB.` }
  }
  return { ok: true }
}
