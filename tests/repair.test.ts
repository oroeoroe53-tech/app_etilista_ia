import { describe, it, expect } from 'vitest'
import { repairJson } from '@/lib/ai/repair'

/**
 * Los modelos fallan de formas muy concretas. Cada caso de aquí es un fallo real
 * y habitual que NO debe costar una segunda llamada a la API (PLAN.md §12).
 */
describe('repairJson', () => {
  it('acepta JSON limpio', () => {
    expect(repairJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('quita la valla de código markdown', () => {
    expect(repairJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('quita la valla sin etiqueta de lenguaje', () => {
    expect(repairJson('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('ignora la frase que el modelo mete antes', () => {
    expect(repairJson('Claro, aquí tienes el resultado:\n{"a":1}')).toEqual({ a: 1 })
  })

  it('ignora la frase que mete después', () => {
    expect(repairJson('{"a":1}\n\nEspero que te sirva.')).toEqual({ a: 1 })
  })

  it('elimina comas colgantes', () => {
    expect(repairJson('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] })
  })

  it('no se corta con llaves dentro de cadenas', () => {
    expect(repairJson('{"nota":"lleva un {logo} delante"}')).toEqual({
      nota: 'lleva un {logo} delante',
    })
  })

  it('no se corta con comillas escapadas', () => {
    expect(repairJson('{"nota":"dice \\"hola\\" y ya"}')).toEqual({ nota: 'dice "hola" y ya' })
  })

  it('acepta arrays en la raíz', () => {
    expect(repairJson('[{"a":1}]')).toEqual([{ a: 1 }])
  })

  it('devuelve null si no hay nada recuperable', () => {
    expect(repairJson('lo siento, no puedo ayudarte con eso')).toBeNull()
  })

  it('devuelve null con entrada vacía en lugar de lanzar', () => {
    expect(repairJson('')).toBeNull()
    expect(repairJson('   ')).toBeNull()
  })

  it('devuelve null si el JSON está truncado a medias', () => {
    expect(repairJson('{"a":1,"b":')).toBeNull()
  })
})
