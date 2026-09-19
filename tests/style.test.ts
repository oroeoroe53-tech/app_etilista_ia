import { describe, it, expect } from 'vitest'
import {
  emptyProfile, affinity, affinityOf, topValues, rejectedValues,
  confidence, profileTrust, toStored, fromStored,
} from '@/lib/style/profile'
import {
  applySignals, buildProfile, feedbackSignal, ownershipSignal,
  photoSignal, wearSignal, formalityBiasFrom, type GarmentAttributes,
} from '@/lib/style/signals'
import { describeProfile } from '@/lib/style/describe'
import { SIGNAL_POINTS } from '@/lib/style/weights'

function garment(over: Partial<GarmentAttributes> = {}): GarmentAttributes {
  return {
    styles: ['minimal'],
    primary_color: 'black',
    secondary_colors: [],
    fit: 'oversized',
    formality: 3,
    ...over,
  }
}

describe('affinity', () => {
  it('sin evidencia, cero', () => {
    expect(affinity(0)).toBe(0)
  })

  it('crece con rendimientos decrecientes', () => {
    const a = affinity(5) - affinity(0)
    const b = affinity(10) - affinity(5)
    expect(b).toBeLessThan(a)
  })

  it('está acotada: ninguna racha puede dispararla', () => {
    expect(affinity(1_000_000)).toBeLessThan(1)
    expect(affinity(-1_000_000)).toBeGreaterThan(-1)
  })

  it('es simétrica en el signo', () => {
    expect(affinity(-12)).toBe(-affinity(12))
  })

  it('en la constante de saturación vale exactamente la mitad', () => {
    expect(affinity(5)).toBeCloseTo(0.5, 4)
  })
})

describe('señales', () => {
  it('tener una prenda deja huella en las tres dimensiones', () => {
    const profile = buildProfile([ownershipSignal(garment())])
    expect(profile.style.minimal).toBeGreaterThan(0)
    expect(profile.color.black).toBeGreaterThan(0)
    expect(profile.fit.oversized).toBeGreaterThan(0)
  })

  it('salir en las fotos pesa más que tenerla guardada', () => {
    const solo = buildProfile([ownershipSignal(garment())])
    const conFotos = buildProfile([ownershipSignal(garment()), photoSignal(garment(), 3)])
    expect(conFotos.color.black!).toBeGreaterThan(solo.color.black!)
  })

  it('aparecer en muchas fotos tiene tope: una foto repetida no es una obsesión', () => {
    const cuatro = buildProfile([photoSignal(garment(), 4)])
    const veinte = buildProfile([photoSignal(garment(), 20)])
    expect(veinte.color.black).toBe(cuatro.color.black)
  })

  it('"normal" y "sin determinar" no son preferencias de corte', () => {
    const profile = buildProfile([
      ownershipSignal(garment({ fit: 'regular' })),
      ownershipSignal(garment({ fit: 'unknown' })),
    ])
    expect(profile.fit).toEqual({})
  })

  it('los colores secundarios cuentan menos que el principal', () => {
    const profile = buildProfile([
      ownershipSignal(garment({ primary_color: 'black', secondary_colors: ['red'] })),
    ])
    expect(profile.color.red!).toBeLessThan(profile.color.black!)
  })

  it('un look de cuatro piezas no vale cuatro veces más que uno de dos', () => {
    const dos = buildProfile([feedbackSignal([garment(), garment()], 'like')])
    const cuatro = buildProfile([
      feedbackSignal([garment(), garment(), garment(), garment()], 'like'),
    ])
    const sumar = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
    expect(sumar(cuatro.color)).toBeCloseTo(sumar(dos.color), 5)
  })
})

describe('feedback', () => {
  it('"me encanta" pesa más que "me gusta"', () => {
    const like = buildProfile([feedbackSignal([garment()], 'like')])
    const love = buildProfile([feedbackSignal([garment()], 'love')])
    expect(love.color.black!).toBeGreaterThan(like.color.black!)
  })

  it('un rechazo resta', () => {
    const profile = buildProfile([feedbackSignal([garment()], 'dislike')])
    expect(profile.color.black!).toBeLessThan(0)
  })

  it('"no sé" no mueve el perfil, pero sí cuenta como señal vista', () => {
    const profile = buildProfile([feedbackSignal([garment()], 'skip')])
    expect(profile.color).toEqual({})
    expect(profile.signalCount).toBe(1)
  })

  it('rechazar POR EL COLOR no ensucia lo que sabemos del estilo', () => {
    // Es la razón de ser de preguntar el motivo (PLAN.md §17).
    const base = buildProfile([ownershipSignal(garment())])
    const despues = applySignals(base, [feedbackSignal([garment()], 'dislike', 'color')])

    expect(despues.color.black!).toBeLessThan(base.color.black!)
    expect(despues.style.minimal).toBe(base.style.minimal)
    expect(despues.fit.oversized).toBe(base.fit.oversized)
  })

  it('rechazar por "no es mi estilo" solo toca el estilo', () => {
    const base = buildProfile([ownershipSignal(garment())])
    const despues = applySignals(base, [
      feedbackSignal([garment()], 'dislike', 'not_my_style'),
    ])

    expect(despues.style.minimal!).toBeLessThan(base.style.minimal!)
    expect(despues.color.black).toBe(base.color.black)
  })

  it('"demasiado formal" mueve la formalidad, no castiga atributos', () => {
    const base = buildProfile([ownershipSignal(garment())])
    const despues = applySignals(base, [feedbackSignal([garment()], 'dislike', 'too_formal')])

    expect(despues.formalityBias).toBeLessThan(base.formalityBias)
    expect(despues.color.black).toBe(base.color.black)
  })

  it('"demasiado informal" empuja en el sentido contrario', () => {
    const profile = buildProfile([feedbackSignal([garment()], 'dislike', 'too_casual')])
    expect(profile.formalityBias).toBeGreaterThan(0)
  })

  it('rechazar "una prenda concreta" no dice nada del gusto general', () => {
    const base = buildProfile([ownershipSignal(garment())])
    const despues = applySignals(base, [feedbackSignal([garment()], 'dislike', 'item')])

    expect(despues.color.black).toBe(base.color.black)
    expect(despues.style.minimal).toBe(base.style.minimal)
  })

  it('la formalidad nunca se sale de -1 a 1', () => {
    const muchos = Array.from({ length: 200 }, () =>
      feedbackSignal([garment()], 'dislike', 'too_formal'),
    )
    const profile = buildProfile(muchos)
    expect(profile.formalityBias).toBeGreaterThanOrEqual(-1)
  })
})

describe('formalityBiasFrom', () => {
  it('un armario neutro no inclina nada', () => {
    expect(formalityBiasFrom([garment({ formality: 3 })])).toBe(0)
  })

  it('un armario de estar por casa tira a informal', () => {
    expect(formalityBiasFrom([garment({ formality: 1 })])).toBe(-1)
  })

  it('un armario de etiqueta tira a formal', () => {
    expect(formalityBiasFrom([garment({ formality: 5 })])).toBe(1)
  })

  it('sin prendas no se inventa una inclinación', () => {
    expect(formalityBiasFrom([])).toBe(0)
  })
})

describe('confianza', () => {
  it('con pocas señales admite que no sabe', () => {
    expect(confidence(emptyProfile())).toBe('unknown')
  })

  it('el motor se fía poco de un perfil recién nacido', () => {
    expect(profileTrust(emptyProfile())).toBe(0)
  })

  it('la confianza crece pero nunca pasa de 1', () => {
    const muchas = buildProfile(Array.from({ length: 500 }, () => ownershipSignal(garment())))
    expect(profileTrust(muchas)).toBe(1)
  })
})

describe('lectura del perfil', () => {
  const profile = buildProfile([
    ...Array.from({ length: 6 }, () => ownershipSignal(garment())),
    ...Array.from({ length: 4 }, () =>
      ownershipSignal(garment({ primary_color: 'beige', styles: ['casual'] })),
    ),
    ...Array.from({ length: 5 }, () =>
      feedbackSignal([garment({ primary_color: 'red' })], 'dislike', 'color'),
    ),
  ])

  it('ordena lo que más le gusta', () => {
    const colores = topValues(profile, 'color')
    expect(colores[0]?.value).toBe('black')
  })

  it('detecta lo que rechaza de forma consistente', () => {
    expect(rejectedValues(profile, 'color').map((r) => r.value)).toContain('red')
  })

  it('distingue "no sé nada de esto" de "esto no le gusta"', () => {
    // Los dos darían 0 si se guardaran afinidades en vez de puntos en bruto.
    expect(affinityOf(profile, 'color', 'purple')).toBe(0)
    expect(affinityOf(profile, 'color', 'red')).toBeLessThan(0)
  })
})

describe('retrato en castellano', () => {
  it('con un perfil vacío lo admite en vez de inventarse un estilo', () => {
    const portrait = describeProfile(emptyProfile())
    expect(portrait.headline).toContain('conociendo')
    expect(portrait.colors).toEqual([])
  })

  it('describe un armario con patrón claro', () => {
    const profile = buildProfile(
      Array.from({ length: 12 }, () => ownershipSignal(garment())),
    )
    const portrait = describeProfile(profile)

    expect(portrait.colors).toContain('black')
    expect(portrait.lines.join(' ')).toContain('negro')
  })

  it('nunca enseña un número', () => {
    const profile = buildProfile(
      Array.from({ length: 30 }, () => ownershipSignal(garment())),
    )
    const portrait = describeProfile(profile)
    const texto = [portrait.headline, ...portrait.lines].join(' ')
    expect(texto).not.toMatch(/\d/)
  })

  it('avisa de que es una primera impresión mientras aprende', () => {
    const profile = buildProfile(
      Array.from({ length: 10 }, () => ownershipSignal(garment())),
    )
    expect(describeProfile(profile).caveat).toBeTruthy()
  })
})

describe('guardado y lectura', () => {
  it('ida y vuelta sin pérdida apreciable', () => {
    const original = buildProfile([ownershipSignal(garment()), wearSignal(garment(), 3)])
    const recuperado = fromStored(toStored(original))

    expect(recuperado.color.black).toBeCloseTo(original.color.black!, 2)
    expect(recuperado.signalCount).toBe(original.signalCount)
  })

  it('una fila vacía o corrupta no rompe nada', () => {
    expect(fromStored(null)).toEqual(emptyProfile())
    expect(fromStored({ style_weights: 'basura' } as never)).toEqual(emptyProfile())
  })

  it('descarta valores no numéricos en lugar de propagarlos', () => {
    const profile = fromStored({
      style_weights: { minimal: 2, roto: 'NaN' },
    } as never)
    expect(profile.style).toEqual({ minimal: 2 })
  })
})

describe('coherencia de los pesos', () => {
  it('un rechazo pesa más que un "me gusta"', () => {
    expect(Math.abs(SIGNAL_POINTS.outfitDislike)).toBeGreaterThan(SIGNAL_POINTS.outfitLike)
  })

  it('ponerse una prenda pesa más que solo tenerla en la foto... no: al revés', () => {
    // Aparecer en una foto que subió es evidencia más fuerte que un registro de
    // uso suelto, porque la foto la eligió la persona para enseñarla.
    expect(SIGNAL_POINTS.photoAppearance).toBeGreaterThan(SIGNAL_POINTS.wearItem)
  })

  it('"no sé" vale exactamente cero', () => {
    expect(SIGNAL_POINTS.outfitSkip).toBe(0)
  })
})
