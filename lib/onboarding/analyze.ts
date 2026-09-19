import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { ai } from '@/lib/ai/router'
import { AiError, type ImageInput } from '@/lib/ai/types'
import type { DetectedGarment } from '@/lib/ai/schemas/vision'
import { decideMatch, type ExistingItem } from '@/lib/wardrobe/dedup'
import { rebuildStyleProfile } from '@/lib/style/rebuild'
import { toClothingItem } from '@/lib/wardrobe/normalize'
import { BUCKETS, clothingImagePath } from '@/lib/storage/paths'
import { UPLOAD_RULES } from '@/lib/subscriptions/plans'
import { consumeEntitlement } from '@/lib/subscriptions/entitlements'
import type { Category, Color, Fit, Material, Pattern } from '@/lib/wardrobe/taxonomy'

/**
 * El trabajo de análisis del onboarding.
 *
 * Se ejecuta fuera del ciclo de la petición del usuario: las fotos se suben, sus
 * filas quedan en `pending`, y esto las procesa mientras la interfaz consulta el
 * progreso (PLAN.md §9, riesgo 2).
 *
 * Secuencia:
 *   1. descargar las fotos y reducirlas a 768 px para el modelo
 *   2. UNA llamada de visión con todas juntas  ← el ahorro y la calidad
 *   3. guardar la salida cruda en `detected_items`
 *   4. decidir qué es prenda nueva y qué ya existía
 *   5. recortar la miniatura de cada prenda con su bbox
 *   6. cerrar el onboarding
 *
 * Nada de esto vuelve a llamar a la IA: los pasos 3 a 6 son código.
 */

export interface AnalyzeResult {
  photosAnalyzed: number
  itemsCreated: number
  itemsMerged: number
  needsConfirmation: number
}

/** Prepara una foto para el modelo: 768 px de lado largo, JPEG, base64. */
async function toModelImage(buffer: Buffer, index: number): Promise<ImageInput> {
  const optimized = await sharp(buffer)
    .rotate() // respeta la orientación EXIF antes de descartarla
    .resize(UPLOAD_RULES.aiMaxEdge, UPLOAD_RULES.aiMaxEdge, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer()

  return { data: optimized.toString('base64'), mimeType: 'image/jpeg', index }
}

/**
 * Recorta la prenda de la foto usando el recuadro que devolvió el modelo.
 *
 * Así cada prenda del armario tiene imagen sin una sola llamada extra y sin
 * generar ninguna imagen (docs/AI.md).
 *
 * El recuadro se ensancha un poco: los modelos tienden a ajustar de más y un
 * recorte demasiado apretado corta hombros y bajos.
 */
const BBOX_PADDING = 0.06

async function cropGarment(
  photo: Buffer,
  bbox: { x: number; y: number; w: number; h: number },
): Promise<Buffer | null> {
  try {
    const meta = await sharp(photo).metadata()
    const width = meta.width
    const height = meta.height
    if (!width || !height) return null

    const x = Math.max(0, bbox.x - BBOX_PADDING)
    const y = Math.max(0, bbox.y - BBOX_PADDING)
    const w = Math.min(1 - x, bbox.w + BBOX_PADDING * 2)
    const h = Math.min(1 - y, bbox.h + BBOX_PADDING * 2)

    const left = Math.round(x * width)
    const top = Math.round(y * height)
    const cropWidth = Math.max(1, Math.round(w * width))
    const cropHeight = Math.max(1, Math.round(h * height))

    // Un recorte minúsculo suele ser una detección mala: mejor sin foto que con basura.
    if (cropWidth < 40 || cropHeight < 40) return null

    return await sharp(photo)
      .rotate()
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      /*
       * Iguala la exposición entre fotos.
       *
       * Cada foto se hizo con una luz distinta —una en el baño, otra en la
       * calle, otra de noche—, y puestas juntas en una cuadrícula esa disparidad
       * es lo que más hace parecer amateur un armario.
       *
       * El recorte de percentiles evita que un reflejo o una sombra dura
       * arrastren todo el rango: se normaliza sobre el 99 % central.
       */
      .normalize({ lower: 1, upper: 99 })
      .jpeg({ quality: 82 })
      .toBuffer()
  } catch (err) {
    console.error('[onboarding] recorte fallido:', err)
    return null
  }
}

interface PhotoRow {
  id: string
  storage_path: string
}

/**
 * Analiza todas las fotos pendientes de un usuario.
 *
 * Nunca lanza por un fallo de IA: marca las fotos como `failed` con su motivo y
 * devuelve el resultado. La interfaz ofrece reintentar (PLAN.md §35).
 */
export async function analyzePendingPhotos(userId: string): Promise<AnalyzeResult> {
  const supabase = createAdminClient()
  const empty: AnalyzeResult = {
    photosAnalyzed: 0,
    itemsCreated: 0,
    itemsMerged: 0,
    needsConfirmation: 0,
  }

  const { data: pending } = await supabase
    .from('outfit_photos')
    .select('id, storage_path')
    .eq('user_id', userId)
    .eq('analysis_status', 'pending')
    .order('created_at', { ascending: true })

  const photos = (pending ?? []) as PhotoRow[]
  if (photos.length === 0) return empty

  const ids = photos.map((p) => p.id)
  await supabase.from('outfit_photos').update({ analysis_status: 'processing' }).in('id', ids)

  try {
    // --- 1. descargar y reducir -------------------------------------------
    const buffers: Buffer[] = []
    const usable: PhotoRow[] = []

    for (const photo of photos) {
      const { data, error } = await supabase.storage
        .from(BUCKETS.outfitPhotos)
        .download(photo.storage_path)

      if (error || !data) {
        await supabase
          .from('outfit_photos')
          .update({ analysis_status: 'failed', analysis_error: 'No se pudo leer la imagen.' })
          .eq('id', photo.id)
        continue
      }
      buffers.push(Buffer.from(await data.arrayBuffer()))
      usable.push(photo)
    }

    if (usable.length === 0) return empty

    const images = await Promise.all(buffers.map((b, i) => toModelImage(b, i)))

    // --- 2. UNA llamada con todas las fotos -------------------------------
    const { data: analysis } = await ai.vision.analyzeOutfitBatch(images, { userId })

    // El cupo se descuenta solo cuando la llamada ha salido bien.
    await consumeEntitlement(userId, 'analyze_outfit')

    // --- 3. armario existente, para no duplicar ---------------------------
    const { data: wardrobe } = await supabase
      .from('clothing_items')
      .select('id, category, primary_color, secondary_colors, pattern, fit, material')
      .eq('user_id', userId)
      .is('deleted_at', null)

    const existing = (wardrobe ?? []) as unknown as ExistingItem[]
    const result: AnalyzeResult = { ...empty, photosAnalyzed: usable.length }

    // --- 4-5. decidir y guardar -------------------------------------------
    for (const garment of analysis.garments) {
      const comparable = {
        category: garment.category as Category,
        primary_color: garment.primary_color as Color,
        secondary_colors: garment.secondary_colors as Color[],
        pattern: garment.pattern as Pattern,
        fit: garment.fit as Fit,
        material: garment.material as Material,
      }

      const decision = decideMatch(comparable, existing, garment.confidence)

      let itemId = decision.existingId ?? null

      if (decision.kind === 'new_item') {
        const { data: inserted } = await supabase
          .from('clothing_items')
          .insert(toClothingItem(garment, userId, { needsReview: decision.needsReview }))
          .select('id')
          .single()

        itemId = (inserted as { id: string } | null)?.id ?? null
        if (itemId) {
          result.itemsCreated++
          // Las siguientes prendas del lote ya compiten contra esta.
          existing.push({ id: itemId, ...comparable })
        }
      } else if (decision.kind === 'auto_merged') {
        result.itemsMerged++
      } else {
        result.needsConfirmation++
      }

      await saveDetections(supabase, {
        userId,
        garment,
        photos: usable,
        decision,
        itemId,
      })

      if (itemId && decision.kind === 'new_item') {
        await attachThumbnail(supabase, { userId, itemId, garment, photos: usable, buffers })
      }
    }

    await supabase
      .from('outfit_photos')
      .update({ analysis_status: 'done', analyzed_at: new Date().toISOString() })
      .in(
        'id',
        usable.map((p) => p.id),
      )

    await supabase
      .from('profiles')
      .update({ onboarding_stage: result.needsConfirmation > 0 ? 'review' : 'completed' })
      .eq('id', userId)

    // Ya hay armario: se puede construir el primer retrato de estilo. Es todo
    // código, no cuesta ninguna llamada de IA.
    //
    // Aquí sí se espera: el análisis ya dura medio minuto y la persona está
    // mirando una barra de progreso. Un cuarto de segundo más no se nota, y a
    // cambio el perfil está listo en cuanto termina.
    await rebuildStyleProfile(userId).catch((err) =>
      console.error('[onboarding] no se pudo calcular el perfil de estilo:', err),
    )

    return result
  } catch (err) {
    const message =
      err instanceof AiError
        ? 'No hemos podido analizar las fotos. Inténtalo de nuevo.'
        : 'Algo ha fallado al procesar las fotos.'

    console.error('[onboarding] análisis fallido:', err)

    await supabase
      .from('outfit_photos')
      .update({ analysis_status: 'failed', analysis_error: message })
      .in('id', ids)
      .eq('analysis_status', 'processing')

    await supabase.from('profiles').update({ onboarding_stage: 'photos_uploaded' }).eq('id', userId)

    return empty
  }
}

type Admin = ReturnType<typeof createAdminClient>

/** Guarda la lectura cruda del modelo, una fila por aparición de la prenda. */
async function saveDetections(
  supabase: Admin,
  args: {
    userId: string
    garment: DetectedGarment
    photos: PhotoRow[]
    decision: ReturnType<typeof decideMatch>
    itemId: string | null
  },
) {
  const { userId, garment, photos, decision, itemId } = args

  const rows = garment.photo_indexes
    .map((index) => {
      const photo = photos[index]
      if (!photo) return null
      const bbox = garment.bboxes.find((b) => b.photo_index === index) ?? null
      return {
        photo_id: photo.id,
        user_id: userId,
        raw: garment as unknown as Record<string, unknown>,
        bbox,
        garment_group: garment.garment_group,
        clothing_item_id: itemId,
        match_confidence: decision.similarity,
        match_status: decision.kind,
      }
    })
    .filter((r) => r !== null)

  if (rows.length > 0) await supabase.from('detected_items').insert(rows)
}

/** Recorta la prenda de la foto donde mejor se vea y la guarda como miniatura. */
async function attachThumbnail(
  supabase: Admin,
  args: {
    userId: string
    itemId: string
    garment: DetectedGarment
    photos: PhotoRow[]
    buffers: Buffer[]
  },
) {
  const { userId, itemId, garment, buffers } = args

  // La aparición más grande suele ser la más nítida.
  const bbox = [...garment.bboxes].sort((a, b) => b.w * b.h - a.w * a.h)[0]
  if (!bbox) return

  const source = buffers[bbox.photo_index]
  if (!source) return

  const cropped = await cropGarment(source, bbox)
  if (!cropped) return

  const path = clothingImagePath(userId, itemId)
  const { error } = await supabase.storage
    .from(BUCKETS.clothing)
    .upload(path, cropped, { contentType: 'image/jpeg', upsert: true })

  if (error) {
    console.error('[onboarding] no se pudo subir la miniatura:', error.message)
    return
  }

  await supabase.from('clothing_items').update({ image_path: path }).eq('id', itemId)
}
