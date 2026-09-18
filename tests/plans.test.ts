import { describe, it, expect } from 'vitest'
import {
  PLAN_LIMITS,
  FEATURE_METRICS,
  periodKey,
  limitFor,
  type Feature,
} from '@/lib/subscriptions/plans'
import { estimateCostUsd } from '@/lib/ai/pricing'

describe('planes', () => {
  it('ningún plan es ilimitado', () => {
    // Regla explícita del §28: "ilimitado" no existe, ni siquiera en Pro.
    for (const plan of Object.values(PLAN_LIMITS)) {
      for (const limit of Object.values(plan)) {
        expect(Number.isFinite(limit)).toBe(true)
        expect(limit).toBeLessThan(10_000)
      }
    }
  })

  it('Pro nunca da menos que Free', () => {
    for (const feature of Object.keys(PLAN_LIMITS.free) as Feature[]) {
      expect(PLAN_LIMITS.pro[feature]).toBeGreaterThanOrEqual(PLAN_LIMITS.free[feature])
    }
  })

  it('toda funcionalidad tiene métrica y límite en los dos planes', () => {
    for (const feature of Object.keys(FEATURE_METRICS) as Feature[]) {
      expect(FEATURE_METRICS[feature].metric).toBeTruthy()
      expect(limitFor('free', feature)).toBeTypeOf('number')
      expect(limitFor('pro', feature)).toBeTypeOf('number')
    }
  })

  it('el try-on no está en Free', () => {
    expect(PLAN_LIMITS.free.generate_tryon).toBe(0)
  })
})

describe('periodKey', () => {
  const momento = new Date('2026-09-18T22:30:00Z')

  it('resuelve el día en UTC', () => {
    expect(periodKey('day', momento)).toBe('2026-09-18')
  })

  it('resuelve el mes', () => {
    expect(periodKey('month', momento)).toBe('2026-09')
  })

  it('usa una clave fija para los totales', () => {
    expect(periodKey('total', momento)).toBe('all')
  })

  it('rellena con ceros los meses y días de un dígito', () => {
    expect(periodKey('day', new Date('2026-01-05T10:00:00Z'))).toBe('2026-01-05')
  })

  it('cambia de clave al cambiar el día', () => {
    const antes = periodKey('day', new Date('2026-09-18T23:59:59Z'))
    const despues = periodKey('day', new Date('2026-09-19T00:00:01Z'))
    expect(antes).not.toBe(despues)
  })
})

describe('estimación de coste', () => {
  it('el modo mock nunca cuesta', () => {
    expect(
      estimateCostUsd({ provider: 'mock', model: 'mock', inputTokens: 999_999 }),
    ).toBe(0)
  })

  it('calcula por millón de tokens', () => {
    const cost = estimateCostUsd({
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
      inputTokens: 1_000_000,
      outputTokens: 0,
    })
    expect(cost).toBeCloseTo(0.1, 6)
  })

  it('un modelo desconocido no rompe: devuelve 0', () => {
    expect(
      estimateCostUsd({ provider: 'gemini', model: 'modelo-que-no-existe', inputTokens: 1000 }),
    ).toBe(0)
  })

  it('sin tokens, coste cero', () => {
    expect(estimateCostUsd({ provider: 'openai', model: 'gpt-5-mini' })).toBe(0)
  })
})
