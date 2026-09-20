import { describe, it, expect } from 'vitest'
import { findNeglected, neglectMessage, NEGLECT_RULES, type NeglectedCandidate } from '@/lib/wardrobe/neglected'
import { findGaps, type GapCandidate } from '@/lib/wardrobe/gaps'

const TODAY = new Date('2026-09-19T12:00:00Z')
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86_400_000).toISOString()

function candidate(over: Partial<NeglectedCandidate> = {}): NeglectedCandidate {
  return {
    id: over.id ?? `item-${Math.random().toString(36).slice(2)}`,
    category: 'jacket',
    primary_color: 'green',
    image_path: null,
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    is_available: true,
    times_worn: 5,
    last_worn_at: daysAgo(60),
    created_at: daysAgo(200),
    ...over,
  }
}

describe('prendas olvidadas', () => {
  it('detecta lo que lleva mucho sin salir', () => {
    const result = findNeglected([candidate({ id: 'vieja', last_worn_at: daysAgo(90) })], TODAY)
    expect(result).toHaveLength(1)
    expect(result[0]?.daysSince).toBe(90)
    expect(result[0]?.reason).toBe('long_unworn')
  })

  it('no molesta con lo puesto hace poco', () => {
    expect(findNeglected([candidate({ last_worn_at: daysAgo(5) })], TODAY)).toHaveLength(0)
  })

  it('detecta lo que nunca se ha puesto', () => {
    const result = findNeglected(
      [candidate({ times_worn: 0, last_worn_at: null, created_at: daysAgo(60) })],
      TODAY,
    )
    expect(result[0]?.reason).toBe('never_worn')
  })

  it('da margen a lo recién comprado', () => {
    // Reprochar algo que se añadió anteayer sería absurdo.
    const result = findNeglected(
      [candidate({ times_worn: 0, last_worn_at: null, created_at: daysAgo(3) })],
      TODAY,
    )
    expect(result).toHaveLength(0)
  })

  it('NO menciona un abrigo en verano', () => {
    // Es la regla que decide si estos avisos se leen o se ignoran.
    const julio = new Date('2026-07-15T12:00:00Z')
    const result = findNeglected(
      [candidate({ seasons: ['winter'], last_worn_at: daysAgo(200) })],
      julio,
    )
    expect(result).toHaveLength(0)
  })

  it('sí lo menciona cuando llega su temporada', () => {
    const enero = new Date('2026-01-15T12:00:00Z')
    // Las fechas se calculan respecto a enero, no respecto a TODAY: si no, la
    // "última vez" caería en el futuro y no habría días transcurridos.
    const haceMucho = new Date(enero.getTime() - 200 * 86_400_000).toISOString()

    const result = findNeglected(
      [candidate({ seasons: ['winter'], last_worn_at: haceMucho })],
      enero,
    )
    expect(result).toHaveLength(1)
  })

  it('una prenda sin temporada marcada vale siempre', () => {
    const julio = new Date('2026-07-15T12:00:00Z')
    const result = findNeglected([candidate({ seasons: [], last_worn_at: daysAgo(100) })], julio)
    expect(result).toHaveLength(1)
  })

  it('lo guardado a propósito no es un olvido', () => {
    const result = findNeglected(
      [candidate({ is_available: false, last_worn_at: daysAgo(200) })],
      TODAY,
    )
    expect(result).toHaveLength(0)
  })

  it('no suelta una lista larga: una lista larga no la lee nadie', () => {
    const muchas = Array.from({ length: 20 }, (_, i) =>
      candidate({ id: `i${i}`, last_worn_at: daysAgo(50 + i) }),
    )
    expect(findNeglected(muchas, TODAY).length).toBeLessThanOrEqual(
      NEGLECT_RULES.maxSuggestions,
    )
  })

  it('prioriza lo que más tiempo lleva sin salir', () => {
    const result = findNeglected(
      [
        candidate({ id: 'reciente', last_worn_at: daysAgo(35) }),
        candidate({ id: 'antigua', last_worn_at: daysAgo(300) }),
      ],
      TODAY,
    )
    expect(result[0]?.id).toBe('antigua')
  })

  it('es determinista con empates', () => {
    const items = [
      candidate({ id: 'b', last_worn_at: daysAgo(50) }),
      candidate({ id: 'a', last_worn_at: daysAgo(50) }),
    ]
    expect(findNeglected(items, TODAY)[0]?.id).toBe('a')
  })

  it('el mensaje informa sin regañar', () => {
    const [item] = findNeglected([candidate({ last_worn_at: daysAgo(200) })], TODAY)
    const texto = neglectMessage(item!, 'La chaqueta verde')

    expect(texto).toContain('medio año')
    expect(texto).not.toMatch(/deberías|tendrías que|nunca usas/i)
  })
})

// ---------------------------------------------------------------------------

function garment(over: Partial<GapCandidate> = {}): GapCandidate {
  return {
    category: 'tshirt',
    formality: 3,
    warmth: 2,
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    is_available: true,
    ...over,
  }
}

describe('huecos del armario', () => {
  it('con un armario recién empezado no señala nada', () => {
    // Decirle a alguien con tres prendas que le faltan cosas es decir lo obvio.
    expect(findGaps([garment(), garment()])).toEqual([])
  })

  it('lo que falta del todo sale con la barra a cero', () => {
    /*
     * La pantalla de Estilo pinta `coverage` como una barra. Tiene que ser un
     * número contado, no una estimación: si no hay ni un zapato, la barra está
     * vacía y eso es exactamente lo que pasa.
     */
    const items = [
      garment(), garment(), garment(),
      garment({ category: 'jeans' }), garment({ category: 'chinos' }),
    ]
    const gap = findGaps(items).find((g) => g.kind === 'missing_layer')
    expect(gap?.coverage).toBe(0)
  })

  it('una temporada floja mide lo que le falta, no lo que le sobra', () => {
    const items = [
      garment({ seasons: ['summer'] }),
      garment({ category: 'jeans', seasons: ['summer'] }),
      garment({ category: 'sneakers', seasons: ['summer'] }),
      garment({ category: 'shirt', seasons: ['summer'] }),
      garment({ category: 'shorts', seasons: ['summer'] }),
      // Dos prendas de invierno de las cuatro que harían falta: medio cubierto.
      garment({ category: 'coat', seasons: ['winter'], warmth: 5 }),
      garment({ category: 'sweater', seasons: ['winter'], warmth: 4 }),
    ]
    const gap = findGaps(items).find((g) => g.kind === 'season_thin')
    expect(gap?.coverage).toBeCloseTo(0.5, 5)
  })

  it('todas las coberturas caen entre 0 y 1', () => {
    // La barra se pinta con `width: X%`: un valor fuera de rango se desborda.
    const items = [
      garment(), garment(), garment(), garment(), garment(), garment(),
      garment({ category: 'jeans' }),
      garment({ category: 'trousers', formality: 5 }),
      garment({ category: 'sneakers', formality: 2 }),
      garment({ category: 'shirt', formality: 5, seasons: ['winter'] }),
    ]
    for (const gap of findGaps(items)) {
      expect(gap.coverage).toBeGreaterThanOrEqual(0)
      expect(gap.coverage).toBeLessThanOrEqual(1)
    }
  })

  it('avisa si no hay calzado', () => {
    const items = [
      garment(), garment(), garment(),
      garment({ category: 'jeans' }), garment({ category: 'chinos' }),
    ]
    const gaps = findGaps(items)
    expect(gaps.some((g) => g.kind === 'missing_layer' && g.severity === 'high')).toBe(true)
  })

  it('detecta el caso clásico: ropa de vestir sin zapatos a la altura', () => {
    const items = [
      garment({ category: 'shirt', formality: 5 }),
      garment({ category: 'trousers', formality: 5 }),
      garment({ category: 'blazer', formality: 5 }),
      garment({ category: 'sneakers', formality: 2 }),
      garment({ category: 'tshirt', formality: 2 }),
      garment({ category: 'jeans', formality: 2 }),
    ]
    const gaps = findGaps(items)
    const orphan = gaps.find((g) => g.kind === 'formality_orphan')

    expect(orphan).toBeDefined()
    expect(orphan!.title.toLowerCase()).toContain('calzado')
  })

  it('no inventa huecos en un armario completo', () => {
    const items = [
      ...Array.from({ length: 6 }, () => garment({ category: 'tshirt' })),
      ...Array.from({ length: 4 }, () => garment({ category: 'jeans' })),
      ...Array.from({ length: 3 }, () => garment({ category: 'sneakers' })),
      garment({ category: 'coat', warmth: 5, formality: 3 }),
      garment({ category: 'shirt', formality: 4 }),
      garment({ category: 'chinos', formality: 4 }),
      garment({ category: 'shoes', formality: 4 }),
    ]
    const gaps = findGaps(items)
    expect(gaps.filter((g) => g.severity === 'high')).toHaveLength(0)
  })

  it('un vestido cubre arriba y abajo', () => {
    const items = [
      garment({ category: 'dress' }), garment({ category: 'dress' }),
      garment({ category: 'sneakers' }), garment({ category: 'boots' }),
      garment({ category: 'jacket' }),
    ]
    const gaps = findGaps(items)
    const falta = gaps.filter((g) => g.kind === 'missing_layer')
    expect(falta).toHaveLength(0)
  })

  it('avisa si no hay nada que abrigue de verdad', () => {
    const items = Array.from({ length: 8 }, () =>
      garment({ warmth: 2, seasons: ['autumn', 'winter'] }),
    ).concat([garment({ category: 'jeans' }), garment({ category: 'sneakers' })])

    expect(findGaps(items).some((g) => g.kind === 'nothing_warm')).toBe(true)
  })

  it('no avisa de abrigo si no hay nada de invierno en el armario', () => {
    const items = [
      ...Array.from({ length: 5 }, () => garment({ seasons: ['summer'], warmth: 1 })),
      garment({ category: 'jeans', seasons: ['summer'] }),
      garment({ category: 'sandals', seasons: ['summer'] }),
    ]
    expect(findGaps(items).some((g) => g.kind === 'nothing_warm')).toBe(false)
  })

  it('lo que bloquea va primero', () => {
    const items = [
      ...Array.from({ length: 8 }, () => garment()),
      garment({ category: 'jeans' }),
    ]
    const gaps = findGaps(items)
    if (gaps.length > 1) {
      const orden = { high: 0, medium: 1, low: 2 }
      for (let i = 1; i < gaps.length; i++) {
        expect(orden[gaps[i]!.severity]).toBeGreaterThanOrEqual(orden[gaps[i - 1]!.severity])
      }
    }
  })

  it('ignora lo que está guardado', () => {
    const items = [
      ...Array.from({ length: 5 }, () => garment()),
      garment({ category: 'jeans' }),
      garment({ category: 'sneakers', is_available: false }),
    ]
    expect(findGaps(items).some((g) => g.kind === 'missing_layer')).toBe(true)
  })

  it('ningún mensaje suena a reproche', () => {
    const items = [
      ...Array.from({ length: 6 }, () => garment()),
      garment({ category: 'jeans' }),
    ]
    for (const gap of findGaps(items)) {
      expect(gap.detail).not.toMatch(/deberías|tendrías que|error|mal/i)
      expect(gap.title.length).toBeGreaterThan(0)
    }
  })
})
