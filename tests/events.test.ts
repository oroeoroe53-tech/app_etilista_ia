import { describe, it, expect } from 'vitest'
import { findClashes, clashMessage, freeColors } from '@/lib/events/clash'

/**
 * El aviso de «vais iguales» es lo único que hace esta función y que no haga ya
 * un grupo de mensajería. Si se equivoca, la pantalla pasa de útil a molesta:
 * un aviso falso cada vez que dos personas van de negro es peor que no avisar.
 */

describe('quién va igual', () => {
  it('dos del mismo color son una coincidencia', () => {
    const clashes = findClashes([
      { name: 'Ana', color: 'green' },
      { name: 'Marta', color: 'green' },
      { name: 'Lucía', color: 'red' },
    ])
    expect(clashes).toHaveLength(1)
    expect(clashes[0]?.names).toEqual(['Ana', 'Marta'])
  })

  it('el negro NO cuenta', () => {
    // En una boda van de negro la mitad de las invitadas y siempre ha estado
    // bien. Avisar ahí quema el aviso para cuando de verdad importa.
    expect(findClashes([
      { name: 'Ana', color: 'black' },
      { name: 'Marta', color: 'black' },
    ])).toEqual([])
  })

  it('multicolor tampoco: dos estampados no son el mismo vestido', () => {
    expect(findClashes([
      { name: 'Ana', color: 'multicolor' },
      { name: 'Marta', color: 'multicolor' },
    ])).toEqual([])
  })

  it('quien no ha dicho de qué va no aparece', () => {
    expect(findClashes([
      { name: 'Ana', color: null },
      { name: 'Marta', color: null },
    ])).toEqual([])
  })

  it('primero donde más gente coincide', () => {
    const clashes = findClashes([
      { name: 'Ana', color: 'red' },
      { name: 'Marta', color: 'red' },
      { name: 'Lucía', color: 'green' },
      { name: 'Sara', color: 'green' },
      { name: 'Eva', color: 'green' },
    ])
    expect(clashes[0]?.color).toBe('green')
    expect(clashes[0]?.names).toHaveLength(3)
  })
})

describe('cómo se dice', () => {
  it('con quien mira dentro, habla de tú', () => {
    const clash = { color: 'green', names: ['Marta', 'Ana'] }
    expect(clashMessage(clash, 'Ana')).toBe('Marta y tú vais de verde')
  })

  it('con quien mira fuera, los nombra a todos', () => {
    const clash = { color: 'red', names: ['Marta', 'Lucía'] }
    expect(clashMessage(clash, 'Ana')).toBe('Marta y Lucía vais de rojo')
  })

  it('tres personas se enumeran bien', () => {
    const clash = { color: 'navy', names: ['Marta', 'Lucía', 'Ana'] }
    expect(clashMessage(clash, 'Ana')).toBe('Marta, Lucía y tú vais de azul marino')
  })

  it('sin saber quién mira, no inventa un tú', () => {
    const clash = { color: 'pink', names: ['Marta', 'Lucía'] }
    expect(clashMessage(clash, null)).toBe('Marta y Lucía vais de rosa')
  })
})

describe('qué colores quedan libres', () => {
  it('solo sugiere colores que tienes', () => {
    const free = freeColors(
      [{ name: 'Ana', color: 'green' }],
      ['green', 'navy', 'red'],
    )
    expect(free).toEqual(['navy', 'red'])
  })

  it('no sugiere el negro: no es una sugerencia, es una rendición', () => {
    expect(freeColors([], ['black', 'navy'])).toEqual(['navy'])
  })

  it('si no te queda nada, no inventa', () => {
    expect(
      freeColors([{ name: 'Ana', color: 'navy' }], ['navy']),
    ).toEqual([])
  })
})
