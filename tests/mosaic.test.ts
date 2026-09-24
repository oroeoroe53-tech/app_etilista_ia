import { describe, it, expect } from 'vitest'
import { packTiles } from '@/lib/social/mosaic'

const spans = (t: ReturnType<typeof packTiles<string>>) => t.map((p) => p.span)

describe('packTiles', () => {
  it('una grande ocupa la fila entera', () => {
    expect(spans(packTiles([['a', 'hero']]))).toEqual([6])
  })

  it('dos medias llenan una fila', () => {
    expect(spans(packTiles([['a', 'half'], ['b', 'half']]))).toEqual([3, 3])
  })

  it('tres pequeñas llenan una fila', () => {
    expect(spans(packTiles([['a', 'small'], ['b', 'small'], ['c', 'small']]))).toEqual([2, 2, 2])
  })

  it('una media sola se estira: nunca queda medio hueco', () => {
    expect(spans(packTiles([['a', 'half']]))).toEqual([6])
  })

  it('dos pequeñas solas se reparten la fila', () => {
    expect(spans(packTiles([['a', 'small'], ['b', 'small']]))).toEqual([2, 4])
  })

  it('la que no cabe abre fila nueva y la anterior se cierra estirando', () => {
    // media + media = 6, luego pequeña sola -> 6
    expect(spans(packTiles([['a', 'half'], ['b', 'half'], ['c', 'small']]))).toEqual([3, 3, 6])
  })

  it('ninguna fila deja hueco, sea cual sea la combinación', () => {
    const pesos = ['hero', 'half', 'small'] as const
    for (let n = 1; n <= 5; n++) {
      for (let mask = 0; mask < 3 ** n; mask++) {
        let m = mask
        const tiles: (readonly [string, (typeof pesos)[number]])[] = []
        for (let i = 0; i < n; i++) {
          tiles.push([`t${i}`, pesos[m % 3]!])
          m = Math.floor(m / 3)
        }
        const packed = packTiles(tiles)
        // Se recorren las filas sumando: cada corte tiene que dar exactamente 6.
        let acc = 0
        for (const p of packed) {
          acc += p.span
          if (acc === 6) acc = 0
          expect(acc).toBeLessThan(6)
        }
        expect(acc).toBe(0)
      }
    }
  })

  it('conserva el orden y los elementos', () => {
    const packed = packTiles([['a', 'small'], ['b', 'hero'], ['c', 'half']])
    expect(packed.map((p) => p.item)).toEqual(['a', 'b', 'c'])
  })
})
