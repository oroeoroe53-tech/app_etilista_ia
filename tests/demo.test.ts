import { describe, it, expect } from 'vitest'
import { demoWardrobe } from '@/lib/demo/wardrobe'
import { generateOutfits } from '@/lib/outfits/engine'
import { emptyProfile } from '@/lib/style/profile'
import { seasonOf } from '@/lib/outfits/filters'
import { layerOf } from '@/lib/wardrobe/taxonomy'

/**
 * El escaparate.
 *
 * `/demo` es lo primero que ve alguien que llega desde un anuncio, y lo que
 * enseña no está escrito a mano: lo compone el motor con este armario. Eso
 * significa que un cambio en el motor o en el armario puede dejar la
 * demostración en blanco sin que nadie se entere hasta que la vea un
 * desconocido.
 *
 * Estos tests existen para que se entere antes el proyecto.
 */

const MESES = [0, 3, 6, 9] // enero, abril, julio, octubre

describe('armario de la demostración', () => {
  it('tiene prendas de las capas imprescindibles', () => {
    const capas = new Set(demoWardrobe().map((item) => layerOf(item.category)))
    for (const capa of ['top', 'bottom', 'footwear'] as const) {
      expect(capas.has(capa), `falta ${capa}`).toBe(true)
    }
  })

  it('no repite identificadores', () => {
    const items = demoWardrobe()
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it('las fechas son relativas a hoy, no fijas', () => {
    // Si fueran constantes, dentro de un año la demostración diría que la
    // camiseta se llevó por última vez hace cuatrocientos días.
    const enero = demoWardrobe(new Date('2026-01-15T12:00:00Z'))
    const julio = demoWardrobe(new Date('2026-07-15T12:00:00Z'))

    const unoEnero = enero.find((i) => i.last_worn_at)!
    const unoJulio = julio.find((i) => i.id === unoEnero.id)!

    expect(unoJulio.last_worn_at).not.toBe(unoEnero.last_worn_at)
  })
})

describe('la demostración compone looks todo el año', () => {
  for (const mes of MESES) {
    it(`compone tres looks en el mes ${mes + 1}`, () => {
      const today = new Date(Date.UTC(2026, mes, 15, 12))
      const { outfits } = generateOutfits({
        wardrobe: demoWardrobe(today),
        profile: emptyProfile(),
        context: { temperatureC: 18, rain: false, season: seasonOf(today), today },
        count: 3,
      })

      // Una demostración con dos huecos es peor que no tener demostración.
      expect(outfits).toHaveLength(3)

      for (const outfit of outfits) {
        expect(outfit.items.length).toBeGreaterThanOrEqual(3)
        expect(outfit.score).toBeGreaterThan(0)
      }
    })
  }

  it('los tres looks son distintos entre sí', () => {
    const today = new Date(Date.UTC(2026, 9, 15, 12))
    const { outfits } = generateOutfits({
      wardrobe: demoWardrobe(today),
      profile: emptyProfile(),
      context: { temperatureC: 18, rain: false, season: seasonOf(today), today },
      count: 3,
    })

    const firmas = outfits.map((o) =>
      o.items
        .map((i) => i.id)
        .sort()
        .join('|'),
    )
    expect(new Set(firmas).size).toBe(3)
  })

  it('aguanta el frío y el calor', () => {
    const today = new Date(Date.UTC(2026, 9, 15, 12))
    for (const temperatureC of [-2, 35]) {
      const { outfits } = generateOutfits({
        wardrobe: demoWardrobe(today),
        profile: emptyProfile(),
        context: { temperatureC, rain: false, season: seasonOf(today), today },
        count: 1,
      })
      expect(outfits.length, `sin looks a ${temperatureC}°`).toBeGreaterThan(0)
    }
  })
})
