import { describe, it, expect } from 'vitest'
import {
  CHALLENGES,
  challengeOfWeek,
  challengeProgress,
  weekStart,
  type WornEntry,
} from '@/lib/challenges/catalogue'

/**
 * Un reto que cuenta mal es peor que no tener retos: le dice a alguien que ha
 * completado algo que no ha hecho, o le niega algo que sí. Aquí se fija cómo
 * cuenta cada uno.
 */

function worn(day: string, itemId: string, color = 'navy'): WornEntry {
  return { day, itemId, color }
}

describe('la semana y el reto que toca', () => {
  it('la semana empieza en lunes', () => {
    // 2026-09-23 es miércoles; su lunes es el 21.
    expect(weekStart(new Date('2026-09-23T10:00:00Z'))).toBe('2026-09-21')
    expect(weekStart(new Date('2026-09-21T00:30:00Z'))).toBe('2026-09-21')
    // Domingo pertenece a la semana que empezó el lunes anterior.
    expect(weekStart(new Date('2026-09-27T23:00:00Z'))).toBe('2026-09-21')
  })

  it('a todo el mundo le toca el mismo reto el mismo día', () => {
    const a = challengeOfWeek(new Date('2026-09-21T06:00:00Z'))
    const b = challengeOfWeek(new Date('2026-09-25T22:00:00Z'))
    expect(a.id).toBe(b.id)
  })

  it('cambia de una semana a la siguiente', () => {
    const esta = challengeOfWeek(new Date('2026-09-21T10:00:00Z'))
    const siguiente = challengeOfWeek(new Date('2026-09-28T10:00:00Z'))
    expect(esta.id).not.toBe(siguiente.id)
  })

  it('el catálogo entero sale a lo largo de las semanas', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < CHALLENGES.length; i++) {
      vistos.add(challengeOfWeek(new Date(Date.UTC(2026, 8, 21 + i * 7))).id)
    }
    expect(vistos.size).toBe(CHALLENGES.length)
  })
})

describe('prendas olvidadas', () => {
  it('cuenta días, no prendas', () => {
    // Tres prendas olvidadas el mismo día siguen siendo un día.
    const progress = challengeProgress(
      'forgotten',
      [worn('2026-09-21', 'a'), worn('2026-09-21', 'b'), worn('2026-09-21', 'c')],
      new Set(['a', 'b', 'c']),
    )
    expect(progress.done).toBe(1)
  })

  it('un día sin nada olvidado no cuenta', () => {
    const progress = challengeProgress(
      'forgotten',
      [worn('2026-09-21', 'a'), worn('2026-09-22', 'z')],
      new Set(['a']),
    )
    expect(progress.done).toBe(1)
  })
})

describe('sin repetir nada', () => {
  it('cinco días con ropa distinta lo completan', () => {
    const entries = ['21', '22', '23', '24', '25'].map((d, i) =>
      worn(`2026-09-${d}`, `item-${i}`),
    )
    expect(challengeProgress('no_repeat', entries).completed).toBe(true)
  })

  it('repetir una prenda invalida ese día', () => {
    const progress = challengeProgress('no_repeat', [
      worn('2026-09-21', 'a'),
      worn('2026-09-22', 'b'),
      worn('2026-09-23', 'a'), // repetida
      worn('2026-09-24', 'c'),
    ])
    expect(progress.done).toBe(3)
  })
})

describe('tres colores', () => {
  it('se para en cuanto entra el cuarto color', () => {
    const progress = challengeProgress('three_colors', [
      worn('2026-09-21', 'a', 'navy'),
      worn('2026-09-22', 'b', 'white'),
      worn('2026-09-23', 'c', 'beige'),
      worn('2026-09-24', 'd', 'red'),
      worn('2026-09-25', 'e', 'navy'),
    ])
    // Los tres primeros días valen; el cuarto rompe y lo que viene después ya
    // no cuenta, aunque vuelva a la paleta.
    expect(progress.done).toBe(3)
  })
})

describe('sin negro', () => {
  it('un día con algo negro no cuenta', () => {
    const progress = challengeProgress('no_black', [
      worn('2026-09-21', 'a', 'navy'),
      worn('2026-09-22', 'b', 'black'),
      worn('2026-09-23', 'c', 'beige'),
    ])
    expect(progress.done).toBe(2)
  })
})
