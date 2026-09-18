import { VISION_OUTPUT_SHAPE } from '@/lib/ai/schemas/vision'
import type { ImageInput, PromptSpec } from '@/lib/ai/types'

const SYSTEM = `Eres un sistema de análisis de prendas de vestir.
Observas fotografías de personas vestidas e identificas las prendas visibles.
Respondes SIEMPRE con un único objeto JSON válido, sin texto antes ni después,
sin markdown y sin comentarios. Usas exclusivamente los valores permitidos que se
te indican para cada campo. Si un dato no se aprecia, eliges el valor más
conservador ("unknown", lista vacía, o null) en lugar de inventarlo.`

/**
 * Prompt del onboarding: TODAS las fotos en una sola llamada.
 *
 * Esta es la decisión central de coste y calidad del proyecto (PLAN.md §6).
 * Al ver las fotos juntas, el modelo puede decir "esta camiseta negra es la misma
 * que la de la foto 1", que es justo lo que un comparador de atributos hace mal.
 * De paso, es una llamada en lugar de seis.
 */
export function buildOutfitBatchPrompt(images: ImageInput[]): PromptSpec {
  const n = images.length

  const user = `Analiza estas ${n} fotografías de outfits de UNA MISMA PERSONA.
Las fotos van numeradas del 0 al ${n - 1} en el orden en que se te envían.

TAREA 1 — Identificar prendas
Detecta cada prenda claramente visible: parte de arriba, parte de abajo, prenda de
abrigo, calzado y accesorios relevantes. Ignora lo que apenas se intuya.

TAREA 2 — Agrupar repeticiones (lo más importante)
La misma persona repite ropa entre fotos. Compara las fotos ENTRE SÍ.
Si una prenda aparece en varias, devuélvela UNA sola vez con un único
"garment_group" y lista todas sus apariciones en "photo_indexes".
Dos prendas del mismo tipo y color NO son necesariamente la misma: fíjate en
detalles (cuello, largo, estampado, desgaste, botones, logotipo). Ante la duda
real, sepáralas en grupos distintos y baja la "confidence": es preferible que el
usuario fusione dos prendas a que pierda una que sí tiene.

TAREA 3 — Atributos
Para cada prenda rellena los campos indicados.
· "formality": 1 estar por casa · 3 calle · 5 etiqueta.
· "warmth": 1 para calor fuerte · 5 para frío intenso.
· "bboxes": un recuadro por aparición, con coordenadas normalizadas entre 0 y 1
  respecto a esa foto. Se usa para recortar la miniatura de la prenda, así que
  ajústalo a la prenda, no a la persona entera.
· "confidence": 0–1, lo seguro que estás de la identificación y sus atributos.

Si una foto no sirve (muy oscura, sin persona, recorte inútil), márcala con
"unusable": true en "photos" y no inventes prendas a partir de ella.

Responde únicamente con este JSON:
${VISION_OUTPUT_SHAPE}`

  return {
    system: SYSTEM,
    user,
    images,
    temperature: 0.1,
    maxOutputTokens: 4000,
  }
}

/** Foto de una prenda suelta, subida desde el armario. No hay agrupación que hacer. */
export function buildSingleItemPrompt(image: ImageInput): PromptSpec {
  const user = `Analiza esta fotografía de UNA prenda de ropa y devuelve sus atributos.
La foto puede ser de la prenda sola, sobre una superficie o en una percha.

· "formality": 1 estar por casa · 3 calle · 5 etiqueta.
· "warmth": 1 para calor fuerte · 5 para frío intenso.
· "confidence": 0–1.

Responde únicamente con un objeto JSON con los mismos campos que una prenda,
pero SIN "garment_group" ni "photo_indexes".
${VISION_OUTPUT_SHAPE}`

  return {
    system: SYSTEM,
    user,
    images: [image],
    temperature: 0.1,
    maxOutputTokens: 800,
  }
}
