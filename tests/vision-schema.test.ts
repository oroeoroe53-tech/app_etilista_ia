import { describe, it, expect } from 'vitest'
import { outfitBatchAnalysisSchema, detectedGarmentSchema } from '@/lib/ai/schemas/vision'
import { mockVisionProvider } from '@/lib/ai/providers/mock'
import { repairJson } from '@/lib/ai/repair'
import type { ImageInput, PromptSpec } from '@/lib/ai/types'

function fakeImages(n: number): ImageInput[] {
  return Array.from({ length: n }, (_, index) => ({
    data: 'AAAA',
    mimeType: 'image/jpeg',
    index,
  }))
}

function spec(images: ImageInput[]): PromptSpec {
  return { system: 's', user: 'u', images }
}

describe('schema de visión', () => {
  it('rellena los valores por defecto que el modelo puede omitir', () => {
    const parsed = detectedGarmentSchema.parse({
      garment_group: 'g1',
      photo_indexes: [0],
      category: 'tshirt',
      primary_color: 'black',
      confidence: 0.9,
    })

    expect(parsed.pattern).toBe('solid')
    expect(parsed.fit).toBe('unknown')
    expect(parsed.material).toBe('unknown')
    expect(parsed.formality).toBe(3)
    expect(parsed.secondary_colors).toEqual([])
    expect(parsed.bboxes).toEqual([])
  })

  it('rechaza una categoría inventada por el modelo', () => {
    const result = detectedGarmentSchema.safeParse({
      garment_group: 'g1',
      photo_indexes: [0],
      category: 'capa_de_mago',
      primary_color: 'black',
      confidence: 0.9,
    })
    expect(result.success).toBe(false)
  })

  it('rechaza una confianza fuera de 0–1', () => {
    const result = detectedGarmentSchema.safeParse({
      garment_group: 'g1',
      photo_indexes: [0],
      category: 'tshirt',
      primary_color: 'black',
      confidence: 42,
    })
    expect(result.success).toBe(false)
  })

  it('rechaza un recuadro con coordenadas fuera de la imagen', () => {
    const result = detectedGarmentSchema.safeParse({
      garment_group: 'g1',
      photo_indexes: [0],
      category: 'tshirt',
      primary_color: 'black',
      confidence: 0.9,
      bboxes: [{ photo_index: 0, x: 1.4, y: 0.1, w: 0.2, h: 0.2 }],
    })
    expect(result.success).toBe(false)
  })
})

describe('proveedor simulado', () => {
  it('devuelve algo que el schema real acepta', async () => {
    const raw = await mockVisionProvider.complete(spec(fakeImages(6)), 'mock')
    const parsed = outfitBatchAnalysisSchema.safeParse(repairJson(raw.text))

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.garments.length).toBeGreaterThan(5)
    expect(parsed.data.photos).toHaveLength(6)
  })

  it('incluye prendas repetidas entre fotos, para ejercitar la deduplicación', async () => {
    const raw = await mockVisionProvider.complete(spec(fakeImages(6)), 'mock')
    const parsed = outfitBatchAnalysisSchema.parse(repairJson(raw.text))

    const repetidas = parsed.garments.filter((g) => g.photo_indexes.length > 1)
    expect(repetidas.length).toBeGreaterThan(0)
  })

  it('incluye al menos una prenda dudosa, para ejercitar la confirmación', async () => {
    const raw = await mockVisionProvider.complete(spec(fakeImages(6)), 'mock')
    const parsed = outfitBatchAnalysisSchema.parse(repairJson(raw.text))

    expect(parsed.garments.some((g) => g.confidence < 0.6)).toBe(true)
  })

  it('no inventa prendas para fotos que no se han enviado', async () => {
    const raw = await mockVisionProvider.complete(spec(fakeImages(2)), 'mock')
    const parsed = outfitBatchAnalysisSchema.parse(repairJson(raw.text))

    for (const garment of parsed.garments) {
      for (const index of garment.photo_indexes) {
        expect(index).toBeLessThan(2)
      }
    }
  })

  it('es determinista: dos llamadas iguales dan lo mismo', async () => {
    const a = await mockVisionProvider.complete(spec(fakeImages(6)), 'mock')
    const b = await mockVisionProvider.complete(spec(fakeImages(6)), 'mock')
    expect(a.text).toBe(b.text)
  })
})
