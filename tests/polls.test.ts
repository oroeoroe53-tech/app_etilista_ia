import { describe, it, expect } from 'vitest'
import { newPollToken, looksLikeToken } from '@/lib/polls/token'
import { leaderOf } from '@/lib/polls/queries'
import { safeNext } from '@/lib/utils/next-url'
import type { PollOptionView } from '@/lib/polls/types'

/**
 * Lo que se prueba aquí es lo que no se ve al mirar la pantalla.
 *
 * Una votación se prueba a ojo en diez segundos: subes dos fotos y votas. Lo
 * que no se prueba a ojo es que el enlace no sea adivinable y que un empate se
 * cuente como empate, y son las dos cosas que harían daño de verdad.
 */

function option(votes: number, id = String(votes)): PollOptionView {
  return { id, position: 1, label: null, imageUrl: null, votes, share: 0, voters: [] }
}

describe('el token del enlace', () => {
  it('tiene siempre la misma longitud y se reconoce a sí mismo', () => {
    for (let i = 0; i < 200; i++) {
      const token = newPollToken()
      expect(token).toHaveLength(12)
      expect(looksLikeToken(token)).toBe(true)
    }
  })

  it('no repite', () => {
    // No demuestra que sea criptográfico, pero sí detecta el error clásico:
    // sembrar el generador con algo fijo, o usar la hora como semilla.
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) seen.add(newPollToken())
    expect(seen.size).toBe(2000)
  })

  it('no usa caracteres que se confunden al dictarlos', () => {
    const forbidden = /[0o1li]/
    for (let i = 0; i < 300; i++) {
      expect(newPollToken()).not.toMatch(forbidden)
    }
  })

  it('rechaza lo que no tiene forma de token antes de consultar nada', () => {
    expect(looksLikeToken('')).toBe(false)
    expect(looksLikeToken('abc')).toBe(false)
    expect(looksLikeToken('a'.repeat(40))).toBe(false)
    // Mayúsculas, acentos y basura de una inyección por la URL.
    expect(looksLikeToken('ABCDEFGHJKMN')).toBe(false)
    expect(looksLikeToken("abc' or 1=1")).toBe(false)
    expect(looksLikeToken('abcdefghjkm0')).toBe(false)
  })
})

describe('quién va ganando', () => {
  it('sin votos no hay ganadora', () => {
    expect(leaderOf([option(0, 'a'), option(0, 'b')])).toBeNull()
  })

  it('la más votada', () => {
    expect(leaderOf([option(1, 'a'), option(3, 'b'), option(2, 'c')])).toBe('b')
  })

  it('un empate arriba NO tiene ganadora', () => {
    // Inventar una ganadora en un empate es mentirle a quien tiene que salir
    // por la puerta. Se dice que están empatadas.
    expect(leaderOf([option(2, 'a'), option(2, 'b')])).toBeNull()
  })

  it('un empate abajo no estorba a la que va primera', () => {
    expect(leaderOf([option(5, 'a'), option(2, 'b'), option(2, 'c')])).toBe('a')
  })

  it('vuelve a haber ganadora si alguien desempata', () => {
    expect(leaderOf([option(2, 'a'), option(3, 'b')])).toBe('b')
  })
})

describe('volver a donde estabas después de registrarte', () => {
  it('conserva la ruta de la votación', () => {
    expect(safeNext('/v/abcdefghjkmn')).toBe('/v/abcdefghjkmn')
  })

  it('no manda a nadie fuera del dominio', () => {
    // Un destino sin filtrar convierte el registro en un trampolín: un enlace
    // a /register?next=https://... llevaría a la víctima a una copia de esta
    // pantalla con el dominio bueno en el historial.
    expect(safeNext('https://otro.sitio/login')).toBe('/')
    expect(safeNext('//otro.sitio')).toBe('/')
    expect(safeNext('javascript:alert(1)')).toBe('/')
  })

  it('ante cualquier otra cosa, a la portada', () => {
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext(null)).toBe('/')
    expect(safeNext(42)).toBe('/')
    expect(safeNext('sin-barra')).toBe('/')
  })
})
