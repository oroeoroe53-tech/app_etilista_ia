import { describe, it, expect } from 'vitest'
import { currentStreak, weekStates } from '@/lib/social/streak'

/**
 * La racha es el número más grande de la pantalla social, así que es el que
 * más daño hace si miente. Estas pruebas fijan las cuatro reglas que la hacen
 * creíble; si alguna cambia, que cambie a propósito.
 */

const TODAY = new Date('2026-09-21T10:00:00Z') // lunes

describe('la racha', () => {
  it('sin registros, cero', () => {
    expect(currentStreak([], TODAY)).toBe(0)
  })

  it('tres días seguidos acabando hoy', () => {
    expect(currentStreak(['2026-09-21', '2026-09-20', '2026-09-19'], TODAY)).toBe(3)
  })

  it('hoy todavía no cuenta en contra', () => {
    // Son las diez de la mañana y aún no se ha vestido: la racha de ayer sigue
    // viva. Cortarla a medianoche sería castigar por no vestirse a esa hora.
    expect(currentStreak(['2026-09-20', '2026-09-19'], TODAY)).toBe(2)
  })

  it('un hueco la rompe', () => {
    expect(currentStreak(['2026-09-21', '2026-09-19', '2026-09-18'], TODAY)).toBe(1)
  })

  it('si el último registro es de anteayer, la racha ya murió', () => {
    expect(currentStreak(['2026-09-19', '2026-09-18', '2026-09-17'], TODAY)).toBe(0)
  })

  it('varias prendas el mismo día cuentan una vez', () => {
    expect(
      currentStreak(['2026-09-21', '2026-09-21', '2026-09-21', '2026-09-20'], TODAY),
    ).toBe(2)
  })

  it('aguanta marcas de tiempo completas, no solo fechas', () => {
    expect(currentStreak(['2026-09-21T22:10:00Z', '2026-09-20T08:00:00Z'], TODAY)).toBe(2)
  })
})

describe('los siete puntos de la semana', () => {
  it('empieza en lunes', () => {
    // El 21 de septiembre de 2026 es lunes: hoy es el primer punto.
    const states = weekStates([], TODAY)
    expect(states[0]).toBe('today')
    expect(states.slice(1)).toEqual(['future', 'future', 'future', 'future', 'future', 'future'])
  })

  it('distingue puesto, perdido y por venir', () => {
    const wednesday = new Date('2026-09-23T10:00:00Z')
    const states = weekStates(['2026-09-21', '2026-09-23'], wednesday)
    expect(states).toEqual([
      'done', // lunes
      'missed', // martes
      'done', // miércoles, hoy y ya puesto
      'future',
      'future',
      'future',
      'future',
    ])
  })

  it('el domingo cierra la semana, no la abre', () => {
    const sunday = new Date('2026-09-27T10:00:00Z')
    expect(weekStates([], sunday)[6]).toBe('today')
  })
})
