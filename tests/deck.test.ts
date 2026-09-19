import { describe, it, expect } from 'vitest'
import { outfitSignature } from '@/lib/outfits/deck'

/**
 * La firma identifica un conjunto de prendas con independencia del orden.
 *
 * Es lo que permite no volver a preguntar por un look que ya se valoró. Si
 * dependiera del orden, la misma combinación aparecería una y otra vez con
 * distinta firma y la baraja no avanzaría nunca.
 */
describe('outfitSignature', () => {
  it('no depende del orden de las prendas', () => {
    expect(outfitSignature(['b', 'a', 'c'])).toBe(outfitSignature(['c', 'a', 'b']))
  })

  it('distingue conjuntos distintos', () => {
    expect(outfitSignature(['a', 'b'])).not.toBe(outfitSignature(['a', 'c']))
  })

  it('distingue un subconjunto de su conjunto', () => {
    expect(outfitSignature(['a', 'b'])).not.toBe(outfitSignature(['a', 'b', 'c']))
  })

  it('es estable entre llamadas', () => {
    const ids = ['x', 'y', 'z']
    expect(outfitSignature(ids)).toBe(outfitSignature(ids))
  })

  it('no altera el array que recibe', () => {
    const ids = ['c', 'a', 'b']
    outfitSignature(ids)
    expect(ids).toEqual(['c', 'a', 'b'])
  })

  it('aguanta un conjunto de una sola prenda', () => {
    expect(outfitSignature(['solo'])).toBe('solo')
  })
})
