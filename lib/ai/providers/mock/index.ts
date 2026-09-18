import type {
  GeneratedImage,
  ImageGenerationProvider,
  PromptSpec,
  RawCompletion,
  StylistProvider,
  VisionProvider,
} from '@/lib/ai/types'

/**
 * Proveedores simulados.
 *
 * Con `AI_MODE=mock` se puede construir y probar la aplicación entera sin gastar
 * un céntimo y sin conexión (PLAN.md §8). Para que sirva de algo, los datos que
 * devuelve son *realistas*:
 *
 *  · hay prendas que se repiten en varias fotos → ejercita la deduplicación
 *  · hay una prenda con confianza baja        → ejercita "¿es la misma?"
 *  · hay categorías variadas                  → el motor puede componer outfits
 *
 * Es determinista: la misma entrada da siempre la misma salida, así los tests
 * no dependen del azar.
 */

const MOCK_GARMENTS = [
  {
    garment_group: 'g1', category: 'tshirt', subcategory: 'básica',
    primary_color: 'black', secondary_colors: [], pattern: 'solid',
    fit: 'oversized', material: 'cotton', styles: ['minimal', 'casual'],
    seasons: ['spring', 'summer', 'autumn'], formality: 2, warmth: 2,
    repeatIn: [0, 2, 4], confidence: 0.93,
  },
  {
    garment_group: 'g2', category: 'jeans', subcategory: 'rectos',
    primary_color: 'navy', secondary_colors: [], pattern: 'denim',
    fit: 'regular', material: 'denim', styles: ['casual'],
    seasons: ['spring', 'autumn', 'winter'], formality: 3, warmth: 3,
    repeatIn: [0, 3], confidence: 0.9,
  },
  {
    garment_group: 'g3', category: 'sneakers', subcategory: 'blancas',
    primary_color: 'white', secondary_colors: ['grey'], pattern: 'solid',
    fit: 'regular', material: 'synthetic', styles: ['casual', 'minimal'],
    seasons: ['spring', 'summer', 'autumn'], formality: 2, warmth: 2,
    repeatIn: [0, 1, 2, 4], confidence: 0.95,
  },
  {
    garment_group: 'g4', category: 'shirt', subcategory: 'oxford',
    primary_color: 'white', secondary_colors: [], pattern: 'solid',
    fit: 'regular', material: 'cotton', styles: ['minimal', 'business'],
    seasons: ['spring', 'autumn'], formality: 4, warmth: 2,
    repeatIn: [1], confidence: 0.88,
  },
  {
    garment_group: 'g5', category: 'chinos', subcategory: null,
    primary_color: 'beige', secondary_colors: [], pattern: 'solid',
    fit: 'slim', material: 'cotton', styles: ['minimal', 'preppy'],
    seasons: ['spring', 'summer'], formality: 4, warmth: 2,
    repeatIn: [1, 5], confidence: 0.86,
  },
  {
    garment_group: 'g6', category: 'jacket', subcategory: 'bomber',
    primary_color: 'olive', secondary_colors: [], pattern: 'solid',
    fit: 'regular', material: 'synthetic', styles: ['casual', 'streetwear'],
    seasons: ['autumn', 'winter'], formality: 3, warmth: 4,
    repeatIn: [2], confidence: 0.84,
  },
  {
    garment_group: 'g7', category: 'sweater', subcategory: 'cuello redondo',
    primary_color: 'grey', secondary_colors: [], pattern: 'solid',
    fit: 'relaxed', material: 'knit', styles: ['minimal', 'casual'],
    seasons: ['autumn', 'winter'], formality: 3, warmth: 4,
    repeatIn: [3], confidence: 0.91,
  },
  {
    garment_group: 'g8', category: 'coat', subcategory: 'paño',
    primary_color: 'black', secondary_colors: [], pattern: 'solid',
    fit: 'regular', material: 'wool', styles: ['minimal', 'elegant'],
    seasons: ['winter'], formality: 4, warmth: 5,
    repeatIn: [3], confidence: 0.89,
  },
  {
    garment_group: 'g9', category: 'boots', subcategory: 'chelsea',
    primary_color: 'brown', secondary_colors: [], pattern: 'solid',
    fit: 'regular', material: 'leather', styles: ['elegant', 'casual'],
    seasons: ['autumn', 'winter'], formality: 4, warmth: 4,
    repeatIn: [3, 5], confidence: 0.87,
  },
  {
    garment_group: 'g10', category: 'hoodie', subcategory: null,
    primary_color: 'grey', secondary_colors: [], pattern: 'solid',
    fit: 'oversized', material: 'cotton', styles: ['streetwear', 'casual'],
    seasons: ['autumn', 'winter'], formality: 2, warmth: 4,
    repeatIn: [4], confidence: 0.92,
  },
  {
    garment_group: 'g11', category: 'blazer', subcategory: null,
    primary_color: 'navy', secondary_colors: [], pattern: 'solid',
    fit: 'slim', material: 'wool', styles: ['business', 'elegant'],
    seasons: ['spring', 'autumn'], formality: 5, warmth: 3,
    repeatIn: [5], confidence: 0.9,
  },
  {
    // Confianza baja a propósito: dispara el flujo "¿es esta la misma camiseta?".
    garment_group: 'g12', category: 'tshirt', subcategory: 'básica',
    primary_color: 'black', secondary_colors: [], pattern: 'solid',
    fit: 'regular', material: 'cotton', styles: ['casual'],
    seasons: ['summer'], formality: 2, warmth: 2,
    repeatIn: [5], confidence: 0.52,
  },
  {
    garment_group: 'g13', category: 'belt', subcategory: null,
    primary_color: 'brown', secondary_colors: [], pattern: 'solid',
    fit: 'regular', material: 'leather', styles: ['casual', 'elegant'],
    seasons: ['spring', 'summer', 'autumn', 'winter'], formality: 3, warmth: 1,
    repeatIn: [1, 5], confidence: 0.71,
  },
] as const

/** Recuadro reproducible: depende del grupo y la foto, no del azar. */
function fakeBbox(groupIndex: number, photoIndex: number) {
  const x = 0.2 + ((groupIndex * 7) % 20) / 100
  const y = 0.1 + ((groupIndex * 11) % 40) / 100
  return {
    photo_index: photoIndex,
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    w: 0.35,
    h: 0.3,
  }
}

function mockBatchAnalysis(photoCount: number) {
  const garments = MOCK_GARMENTS.map((g, i) => {
    const photo_indexes = g.repeatIn.filter((p) => p < photoCount)
    if (photo_indexes.length === 0) return null
    const { repeatIn: _ignored, ...rest } = g
    return {
      ...rest,
      photo_indexes,
      bboxes: photo_indexes.map((p) => fakeBbox(i, p)),
    }
  }).filter((g) => g !== null)

  const photos = Array.from({ length: photoCount }, (_, i) => ({
    photo_index: i,
    occasion_guess: i % 2 === 0 ? 'casual' : 'work',
    unusable: false,
    note: null,
  }))

  return { garments, photos }
}

function mockSingleItem() {
  const { repeatIn: _r, garment_group: _g, ...item } = MOCK_GARMENTS[0]!
  return { ...item, bboxes: [], confidence: 0.9 }
}

/** Latencia falsa: la interfaz se debe probar con esperas, no instantánea. */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function countImages(spec: PromptSpec) {
  return spec.images?.length ?? 0
}

export const mockVisionProvider: VisionProvider = {
  name: 'mock',
  async complete(spec: PromptSpec): Promise<RawCompletion> {
    const images = countImages(spec)
    await delay(images > 1 ? 1200 : 500)

    const payload = images > 1 ? mockBatchAnalysis(images) : { garments: [mockSingleItem()], photos: [] }
    const text =
      images > 1 ? JSON.stringify(payload) : JSON.stringify(mockSingleItem())

    return {
      text,
      inputTokens: 600 + images * 260,
      outputTokens: Math.ceil(text.length / 4),
    }
  },
}

export const mockStylistProvider: StylistProvider = {
  name: 'mock',
  async complete(spec: PromptSpec): Promise<RawCompletion> {
    await delay(300)

    // Cuenta los "Look N:" del prompt para devolver tantas frases como looks haya.
    const lookCount = Math.max(1, (spec.user.match(/^Look \d+:/gm) ?? []).length)
    const frases = [
      'Combinación sobria con las piezas que más repites, adecuada para la temperatura de hoy.',
      'Un punto más arreglado sin salirte de tu paleta habitual de neutros.',
      'Más relajado, con el calzado que sueles llevar entre semana.',
      'Alternativa con capas por si refresca al caer la tarde.',
    ]

    const explanations = Array.from(
      { length: lookCount },
      (_, i) => frases[i % frases.length]!,
    )

    const text = JSON.stringify({ explanations })
    return { text, inputTokens: 220, outputTokens: Math.ceil(text.length / 4) }
  },
}

/** PNG 1×1 transparente. Suficiente para maquetar la pantalla del try-on. */
const PLACEHOLDER_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

export const mockImageProvider: ImageGenerationProvider = {
  name: 'mock',
  async generate(): Promise<GeneratedImage> {
    await delay(1500)
    return { data: PLACEHOLDER_PNG, mimeType: 'image/png' }
  },
}
