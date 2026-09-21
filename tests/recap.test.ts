import { describe, it, expect } from 'vitest'
import { buildRecap, longestStreak } from '@/lib/social/recap'

/**
 * El resumen se enseña una vez al mes y se comparte. Un número inflado ahí no
 * lo corrige nadie: se queda en una captura.
 */

const names = new Map([
  ['camisa', 'Camisa teja'],
  ['vaqueros', 'Vaqueros negros'],
])

function worn(day: string, itemId: string) {
  return { day: `2026-09-${day}`, itemId }
}

describe('el resumen del mes', () => {
  it('sin nada puesto, lo dice en vez de enseñar ceros', () => {
    const recap = buildRecap({ worn: [], names, challengesDone: 0 })
    expect(recap.empty).toBe(true)
    expect(recap.star).toBeNull()
  })

  it('cuenta días distintos, no prendas', () => {
    const recap = buildRecap({
      worn: [worn('01', 'camisa'), worn('01', 'vaqueros'), worn('02', 'camisa')],
      names,
      challengesDone: 0,
    })
    expect(recap.days).toBe(2)
  })

  it('la estrella es la más puesta', () => {
    const recap = buildRecap({
      worn: [worn('01', 'camisa'), worn('02', 'camisa'), worn('03', 'vaqueros')],
      names,
      challengesDone: 1,
    })
    expect(recap.star?.name).toBe('Camisa teja')
    expect(recap.star?.times).toBe(2)
  })

  it('una prenda puesta una sola vez no es la estrella de nada', () => {
    const recap = buildRecap({
      worn: [worn('01', 'camisa')],
      names,
      challengesDone: 0,
    })
    expect(recap.star).toBeNull()
  })
})

describe('la racha más larga del mes', () => {
  it('encuentra el tramo bueno aunque haya terminado', () => {
    // Del 1 al 4 seguidos, luego un hueco, luego dos días.
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08', '2026-09-09']
    expect(longestStreak(days)).toBe(4)
  })

  it('sin días, cero', () => {
    expect(longestStreak([])).toBe(0)
  })

  it('un día suelto es una racha de uno', () => {
    expect(longestStreak(['2026-09-05'])).toBe(1)
  })
})
