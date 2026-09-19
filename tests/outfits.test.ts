import { describe, it, expect } from 'vitest'
import { generateOutfits } from '@/lib/outfits/engine'
import { applyHardFilters, targetFormality, temperatureBand, seasonOf } from '@/lib/outfits/filters'
import { analyzePalette, accentHarmony, isNeutral, patternPenalty } from '@/lib/outfits/color'
import { selectDiverse, similarity } from '@/lib/outfits/diversity'
import { buildPools, generateCandidates, outerNeeded } from '@/lib/outfits/candidates'
import { scoreCandidate, effectiveWeights } from '@/lib/outfits/scoring'
import { SCORE_WEIGHTS, SLOT_CAP, MAX_CANDIDATES } from '@/lib/outfits/weights'
import { emptyProfile } from '@/lib/style/profile'
import { buildProfile, ownershipSignal } from '@/lib/style/signals'
import type { WardrobeItem } from '@/lib/outfits/types'
import type { Category, Color } from '@/lib/wardrobe/taxonomy'

const TODAY = new Date('2026-09-19T12:00:00Z')

let counter = 0
function item(over: Partial<WardrobeItem> = {}): WardrobeItem {
  counter++
  return {
    id: over.id ?? `item-${counter}`,
    category: 'tshirt' as Category,
    primary_color: 'black' as Color,
    secondary_colors: [],
    pattern: 'solid',
    fit: 'regular',
    material: 'cotton',
    styles: ['casual'],
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    formality: 3,
    warmth: 2,
    is_available: true,
    last_worn_at: null,
    times_worn: 0,
    ...over,
  } as WardrobeItem
}

/** Armario mínimo pero vestible. */
function basicWardrobe(): WardrobeItem[] {
  return [
    item({ id: 'top-1', category: 'tshirt', primary_color: 'black' }),
    item({ id: 'top-2', category: 'shirt', primary_color: 'white', formality: 4 }),
    item({ id: 'bottom-1', category: 'jeans', primary_color: 'navy', warmth: 3 }),
    item({ id: 'bottom-2', category: 'chinos', primary_color: 'beige', formality: 4 }),
    item({ id: 'shoe-1', category: 'sneakers', primary_color: 'white', warmth: 2 }),
    item({ id: 'coat-1', category: 'coat', primary_color: 'black', warmth: 5, formality: 4 }),
  ]
}

// ---------------------------------------------------------------------------

describe('armonía de color', () => {
  it('los neutros están bien clasificados', () => {
    expect(isNeutral('black')).toBe(true)
    expect(isNeutral('navy')).toBe(true) // en ropa el azul marino es neutro
    expect(isNeutral('red')).toBe(false)
  })

  it('un color sobre base neutra es la combinación ideal', () => {
    const palette = analyzePalette([
      { primary_color: 'black' as Color },
      { primary_color: 'white' as Color },
      { primary_color: 'red' as Color },
    ])
    expect(palette.score).toBe(1)
  })

  it('todo neutros funciona, pero no destaca', () => {
    const palette = analyzePalette([
      { primary_color: 'black' as Color },
      { primary_color: 'grey' as Color },
      { primary_color: 'white' as Color },
    ])
    expect(palette.score).toBeGreaterThan(0.7)
    expect(palette.score).toBeLessThan(1)
  })

  it('el monocromo es una decisión, no un accidente', () => {
    const palette = analyzePalette([
      { primary_color: 'black' as Color },
      { primary_color: 'black' as Color },
    ])
    expect(palette.score).toBeGreaterThan(0.85)
  })

  it('dos colores que chocan puntúan mucho menos que dos que armonizan', () => {
    const armonicos = analyzePalette([
      { primary_color: 'blue' as Color },
      { primary_color: 'light_blue' as Color },
    ])
    const chocan = analyzePalette([
      { primary_color: 'red' as Color },
      { primary_color: 'green' as Color },
    ])
    expect(armonicos.score).toBeGreaterThan(chocan.score)
  })

  it('tres o más colores fuertes se descartan casi siempre', () => {
    const palette = analyzePalette([
      { primary_color: 'red' as Color },
      { primary_color: 'green' as Color },
      { primary_color: 'purple' as Color },
    ])
    expect(palette.score).toBeLessThan(0.3)
  })

  it('los análogos y los complementarios funcionan; el medio chirría', () => {
    expect(accentHarmony('blue', 'light_blue')).toBeGreaterThan(0.8) // vecinos
    expect(accentHarmony('blue', 'orange')).toBeGreaterThan(0.7) // opuestos
    expect(accentHarmony('red', 'green')).toBeLessThan(0.5) // zona de conflicto
  })

  it('mezclar estampados penaliza', () => {
    expect(patternPenalty(['solid', 'solid'])).toBe(0)
    expect(patternPenalty(['striped', 'floral'])).toBeGreaterThan(0)
    expect(patternPenalty(['striped', 'floral', 'camo'])).toBeGreaterThan(
      patternPenalty(['striped', 'floral']),
    )
  })

  it('el vaquero no cuenta como estampado: si no, nada combinaría con unos vaqueros', () => {
    expect(patternPenalty(['denim', 'striped'])).toBe(0)
  })
})

// ---------------------------------------------------------------------------

describe('filtros duros', () => {
  const context = { today: TODAY }

  it('una prenda guardada no se propone', () => {
    const wardrobe = [...basicWardrobe(), item({ id: 'guardada', is_available: false })]
    const trace = applyHardFilters(wardrobe, { context })
    expect(trace.kept.map((i) => i.id)).not.toContain('guardada')
    expect(trace.discarded.get('guardada')).toBe('unavailable')
  })

  it('con 30 grados no se propone un plumas', () => {
    const wardrobe = [...basicWardrobe(), item({ id: 'plumas', warmth: 5, category: 'coat' })]
    const trace = applyHardFilters(wardrobe, { context: { ...context, temperatureC: 30 } })
    expect(trace.discarded.get('plumas')).toBe('weather')
  })

  it('con lluvia no se proponen sandalias', () => {
    const wardrobe = [
      ...basicWardrobe(),
      item({ id: 'sandalias', category: 'sandals', warmth: 1 }),
    ]
    const trace = applyHardFilters(wardrobe, {
      context: { ...context, temperatureC: 20, rain: true },
    })
    expect(trace.discarded.get('sandalias')).toBe('weather')
  })

  it('un color vetado se descarta', () => {
    const wardrobe = [...basicWardrobe(), item({ id: 'rosa', primary_color: 'pink' as Color })]
    const trace = applyHardFilters(wardrobe, { context, dislikedColors: ['pink'] })
    expect(trace.discarded.get('rosa')).toBe('disliked_color')
  })

  it('lo puesto hace dos días descansa', () => {
    const anteayer = new Date(TODAY.getTime() - 2 * 86_400_000).toISOString()
    const wardrobe = [...basicWardrobe(), item({ id: 'reciente', last_worn_at: anteayer })]
    const trace = applyHardFilters(wardrobe, { context })
    expect(trace.discarded.get('reciente')).toBe('recently_worn')
  })

  it('pero si no queda nada, se relaja: mejor repetir que no proponer nada', () => {
    const ayer = new Date(TODAY.getTime() - 86_400_000).toISOString()
    // Armario entero recién usado: aplicar el descanso dejaría a la persona desnuda.
    const wardrobe = basicWardrobe().map((i) => ({ ...i, last_worn_at: ayer }))

    const trace = applyHardFilters(wardrobe, { context })

    expect(trace.relaxed).toContain('recently_worn')
    expect(trace.kept.length).toBeGreaterThan(0)
  })

  it('la disponibilidad NO se relaja nunca', () => {
    // Proponer algo que está en la lavadora destruye la confianza más que no proponer.
    const wardrobe = basicWardrobe().map((i) => ({ ...i, is_available: false }))
    const trace = applyHardFilters(wardrobe, { context })

    expect(trace.kept).toHaveLength(0)
    expect(trace.relaxed).not.toContain('unavailable')
  })

  it('una prenda sin temporadas marcadas vale para todo', () => {
    const wardrobe = [...basicWardrobe(), item({ id: 'sin-temporada', seasons: [] })]
    const trace = applyHardFilters(wardrobe, { context: { ...context, season: 'winter' } })
    expect(trace.kept.map((i) => i.id)).toContain('sin-temporada')
  })

  it('las bandas de temperatura cubren todo el rango', () => {
    for (const temp of [-10, 0, 9, 10, 15, 16, 21, 22, 27, 28, 45]) {
      const band = temperatureBand(temp)
      expect(band).toBeDefined()
      expect(band.warmth[0]).toBeLessThanOrEqual(band.warmth[1])
    }
  })

  it('deduce la temporada por la fecha', () => {
    expect(seasonOf(new Date('2026-01-15'))).toBe('winter')
    expect(seasonOf(new Date('2026-04-15'))).toBe('spring')
    expect(seasonOf(new Date('2026-07-15'))).toBe('summer')
    expect(seasonOf(new Date('2026-10-15'))).toBe('autumn')
  })

  it('la ocasión fija la formalidad cuando no se indica otra cosa', () => {
    expect(targetFormality({ occasion: 'formal_event' })).toBe(5)
    expect(targetFormality({ occasion: 'home' })).toBe(1)
    // Lo que se pide expresamente manda sobre la ocasión.
    expect(targetFormality({ occasion: 'home', formality: 4 })).toBe(4)
  })
})

// ---------------------------------------------------------------------------

describe('generación de candidatos', () => {
  it('limita cada hueco para que no explote la combinatoria', () => {
    const muchos = Array.from({ length: 40 }, (_, i) =>
      item({ id: `t${i}`, category: 'tshirt' }),
    )
    const pools = buildPools(muchos, () => Math.random())
    expect(pools.top.length).toBeLessThanOrEqual(SLOT_CAP)
  })

  it('un armario grande no genera un número inmanejable de combinaciones', () => {
    // El caso que el plan marcaba como riesgo: 60 prendas.
    const grande = [
      ...Array.from({ length: 20 }, (_, i) => item({ id: `t${i}`, category: 'tshirt' })),
      ...Array.from({ length: 20 }, (_, i) => item({ id: `b${i}`, category: 'jeans' })),
      ...Array.from({ length: 10 }, (_, i) => item({ id: `s${i}`, category: 'sneakers' })),
      ...Array.from({ length: 10 }, (_, i) => item({ id: `o${i}`, category: 'jacket' })),
    ]
    const pools = buildPools(grande, () => 1)
    const candidates = generateCandidates(pools, {})

    // Lo importante no es solo que sean pocas, sino que **no se haya tocado el
    // tope de seguridad**: ese tope corta el bucle a medias, así que si saltara
    // de forma rutinaria las últimas prendas de abajo no se emparejarían nunca.
    expect(candidates.length).toBeLessThan(MAX_CANDIDATES)
    expect(candidates.length).toBeLessThan(2500)
  })

  it('es determinista: el mismo armario da las mismas combinaciones', () => {
    const wardrobe = basicWardrobe()
    const a = generateCandidates(buildPools(wardrobe, () => 1), {})
    const b = generateCandidates(buildPools(wardrobe, () => 1), {})
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('con frío el abrigo es obligatorio; con calor, no se propone', () => {
    expect(outerNeeded({ temperatureC: 5 })).toBe('required')
    expect(outerNeeded({ temperatureC: 30 })).toBe('unwanted')
    expect(outerNeeded({ temperatureC: 18 })).toBe('optional')
    expect(outerNeeded({ rain: true })).toBe('required')
  })
})

// ---------------------------------------------------------------------------

describe('puntuación', () => {
  const profile = emptyProfile()

  it('los pesos suman 1', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 6)
  })

  it('los pesos efectivos también suman 1', () => {
    const total = Object.values(effectiveWeights(profile)).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 6)
  })

  it('con un perfil vacío, el gusto personal no pesa nada', () => {
    expect(effectiveWeights(emptyProfile()).preference).toBe(0)
  })

  it('lo que se le quita al gusto va a lo objetivo', () => {
    const vacio = effectiveWeights(emptyProfile())
    expect(vacio.occasion).toBeGreaterThan(SCORE_WEIGHTS.occasion)
    expect(vacio.weather).toBeGreaterThan(SCORE_WEIGHTS.weather)
  })

  it('con un perfil formado, el gusto recupera todo su peso', () => {
    const formado = buildProfile(
      Array.from({ length: 60 }, () =>
        ownershipSignal({
          styles: ['minimal'],
          primary_color: 'black',
          fit: 'oversized',
          formality: 3,
        }),
      ),
    )
    expect(effectiveWeights(formado).preference).toBeCloseTo(SCORE_WEIGHTS.preference, 4)
  })

  it('un look coherente puntúa más que uno incoherente', () => {
    const coherente = scoreCandidate(
      {
        top: item({ primary_color: 'white', formality: 4, styles: ['minimal'] }),
        bottom: item({ category: 'chinos', primary_color: 'beige', formality: 4, styles: ['minimal'] }),
        footwear: item({ category: 'shoes', primary_color: 'brown', formality: 4, styles: ['minimal'] }),
        accessories: [],
      },
      { profile, context: { today: TODAY } },
    )

    const incoherente = scoreCandidate(
      {
        top: item({ primary_color: 'red', formality: 1, styles: ['sporty'] }),
        bottom: item({ category: 'trousers', primary_color: 'green', formality: 5, styles: ['formal'] }),
        footwear: item({ category: 'sandals', primary_color: 'purple', formality: 1, styles: ['boho'] }),
        accessories: [],
      },
      { profile, context: { today: TODAY } },
    )

    expect(coherente.score).toBeGreaterThan(incoherente.score)
  })

  it('mezclar etiqueta con estar por casa penaliza aunque la media cuadre', () => {
    // El caso que una media sin más no detectaría: 1 y 5 promedian 3.
    const disperso = scoreCandidate(
      {
        top: item({ formality: 5 }),
        bottom: item({ category: 'joggers', formality: 1 }),
        accessories: [],
      },
      { profile, context: { formality: 3, today: TODAY } },
    )
    const uniforme = scoreCandidate(
      {
        top: item({ formality: 3 }),
        bottom: item({ category: 'jeans', formality: 3 }),
        accessories: [],
      },
      { profile, context: { formality: 3, today: TODAY } },
    )

    expect(uniforme.breakdown.occasion).toBeGreaterThan(disperso.breakdown.occasion)
  })

  it('un color vetado hunde el look aunque el resto encaje', () => {
    const candidate = {
      top: item({ primary_color: 'pink' as Color }),
      bottom: item({ category: 'jeans', primary_color: 'navy' as Color }),
      accessories: [],
    }
    const conVeto = scoreCandidate(candidate, {
      profile,
      context: { today: TODAY },
      dislikedColors: ['pink'],
    })
    const sinVeto = scoreCandidate(candidate, { profile, context: { today: TODAY } })

    expect(conVeto.breakdown.preference).toBeLessThan(sinVeto.breakdown.preference / 2)
  })

  it('lo que nunca se ha puesto puntúa alto en novedad', () => {
    const nuevo = scoreCandidate(
      { top: item({ last_worn_at: null }), bottom: item({ category: 'jeans' }), accessories: [] },
      { profile, context: { today: TODAY } },
    )
    expect(nuevo.breakdown.novelty).toBe(1)
  })

  it('todas las componentes quedan entre 0 y 1', () => {
    const scored = scoreCandidate(
      {
        top: item(),
        bottom: item({ category: 'jeans' }),
        footwear: item({ category: 'sneakers' }),
        accessories: [],
      },
      { profile, context: { temperatureC: 18, today: TODAY } },
    )

    for (const [name, value] of Object.entries(scored.breakdown)) {
      expect(value, name).toBeGreaterThanOrEqual(0)
      expect(value, name).toBeLessThanOrEqual(1)
    }
    expect(scored.score).toBeGreaterThanOrEqual(0)
    expect(scored.score).toBeLessThanOrEqual(1)
  })

  it('genera motivos concretos, no adjetivos vacíos', () => {
    const scored = scoreCandidate(
      {
        top: item({ primary_color: 'white', styles: ['minimal'] }),
        bottom: item({ category: 'jeans', primary_color: 'navy', styles: ['minimal'] }),
        accessories: [],
      },
      { profile, context: { temperatureC: 18, today: TODAY } },
    )
    expect(scored.highlights.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------

describe('diversidad', () => {
  it('dos looks con las mismas prendas se parecen del todo', () => {
    const a = scoreCandidate(
      { top: item({ id: 'x' }), bottom: item({ id: 'y', category: 'jeans' }), accessories: [] },
      { profile: emptyProfile(), context: {} },
    )
    expect(similarity(a, a)).toBe(1)
  })

  it('no devuelve tres versiones del mismo look', () => {
    // Una base fija y solo la camiseta cambiando: sin diversidad, el motor
    // devolvería los tres mejores, que serían casi idénticos.
    const base = { id: 'bottom', category: 'jeans' as Category }
    const scored = ['a', 'b', 'c', 'd'].map((suffix) =>
      scoreCandidate(
        {
          top: item({ id: `top-${suffix}` }),
          bottom: item(base),
          accessories: [],
        },
        { profile: emptyProfile(), context: {} },
      ),
    )
    // Un cuarto look con otra base, algo peor puntuado.
    scored.push(
      scoreCandidate(
        {
          top: item({ id: 'top-e', primary_color: 'red' as Color }),
          bottom: item({ id: 'bottom-2', category: 'chinos', primary_color: 'beige' as Color }),
          accessories: [],
        },
        { profile: emptyProfile(), context: {} },
      ),
    )

    const selected = selectDiverse(scored, 3)
    const bottoms = new Set(
      selected.map((o) => o.items.find((i) => i.category !== 'tshirt')?.id),
    )
    expect(bottoms.size).toBeGreaterThan(1)
  })

  it('el primero siempre es el mejor puntuado', () => {
    const scored = [0.9, 0.5, 0.7].map((score, i) => ({
      items: [item({ id: `i${i}` })],
      candidate: { accessories: [] },
      score,
      breakdown: { color: 0, style: 0, occasion: 0, weather: 0, preference: 0, novelty: 0 },
      highlights: [],
    }))
    expect(selectDiverse(scored, 3)[0]?.score).toBe(0.9)
  })

  it('no devuelve más de lo que hay', () => {
    const scored = [
      scoreCandidate({ top: item(), bottom: item({ category: 'jeans' }), accessories: [] }, {
        profile: emptyProfile(),
        context: {},
      }),
    ]
    expect(selectDiverse(scored, 5)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------

describe('motor completo', () => {
  const profile = emptyProfile()

  it('compone looks con un armario normal', () => {
    const result = generateOutfits({
      wardrobe: basicWardrobe(),
      profile,
      context: { temperatureC: 18, today: TODAY },
    })

    expect(result.emptyReason).toBeNull()
    expect(result.outfits.length).toBeGreaterThan(0)
    expect(result.outfits.length).toBeLessThanOrEqual(3)
  })

  it('todo look tiene con qué cubrir arriba y abajo', () => {
    const result = generateOutfits({
      wardrobe: basicWardrobe(),
      profile,
      context: { temperatureC: 18, today: TODAY },
    })

    for (const outfit of result.outfits) {
      const hasTop = outfit.items.some((i) => ['tshirt', 'shirt'].includes(i.category))
      const hasBottom = outfit.items.some((i) => ['jeans', 'chinos'].includes(i.category))
      expect(hasTop && hasBottom).toBe(true)
    }
  })

  it('nunca propone dos prendas del mismo hueco', () => {
    const result = generateOutfits({
      wardrobe: basicWardrobe(),
      profile,
      context: { today: TODAY },
    })

    for (const outfit of result.outfits) {
      const bottoms = outfit.items.filter((i) => ['jeans', 'chinos'].includes(i.category))
      expect(bottoms.length).toBeLessThanOrEqual(1)
    }
  })

  it('con el armario vacío lo dice, no devuelve una pantalla en blanco', () => {
    const result = generateOutfits({ wardrobe: [], profile, context: {} })
    expect(result.emptyReason).toBe('no_wardrobe')
    expect(result.outfits).toHaveLength(0)
  })

  it('con todo en la lavadora lo dice en vez de inventarse algo', () => {
    const result = generateOutfits({
      wardrobe: basicWardrobe().map((i) => ({ ...i, is_available: false })),
      profile,
      context: {},
    })
    expect(result.emptyReason).toBe('nothing_wearable')
  })

  it('respeta las combinaciones prohibidas', () => {
    const result = generateOutfits({
      wardrobe: basicWardrobe(),
      profile,
      context: { today: TODAY },
      neverCombine: [['top-1', 'bottom-1']],
    })

    for (const outfit of result.outfits) {
      const ids = outfit.items.map((i) => i.id)
      expect(ids.includes('top-1') && ids.includes('bottom-1')).toBe(false)
    }
  })

  it('con frío mete abrigo', () => {
    const result = generateOutfits({
      wardrobe: basicWardrobe(),
      profile,
      context: { temperatureC: 4, today: TODAY },
    })

    expect(result.outfits.length).toBeGreaterThan(0)
    for (const outfit of result.outfits) {
      expect(outfit.items.some((i) => i.category === 'coat')).toBe(true)
    }
  })

  it('con calor no propone abrigo', () => {
    const wardrobe = basicWardrobe().map((i) =>
      i.category === 'coat' ? i : { ...i, warmth: 1, seasons: ['summer'] as WardrobeItem['seasons'] },
    )
    const result = generateOutfits({
      wardrobe,
      profile,
      context: { temperatureC: 32, season: 'summer', today: TODAY },
    })

    for (const outfit of result.outfits) {
      expect(outfit.items.some((i) => i.category === 'coat')).toBe(false)
    }
  })

  it('es determinista: dos llamadas iguales dan lo mismo', () => {
    const input = {
      wardrobe: basicWardrobe(),
      profile,
      context: { temperatureC: 18, today: TODAY },
    }
    const a = generateOutfits(input)
    const b = generateOutfits(input)

    expect(a.outfits.map((o) => o.items.map((i) => i.id))).toEqual(
      b.outfits.map((o) => o.items.map((i) => i.id)),
    )
  })

  it('aguanta un armario de 300 prendas sin atascarse', () => {
    const grande: WardrobeItem[] = []
    const cats: Category[] = ['tshirt', 'shirt', 'jeans', 'chinos', 'sneakers', 'boots', 'jacket']
    for (let i = 0; i < 300; i++) {
      grande.push(item({ id: `x${i}`, category: cats[i % cats.length]! }))
    }

    const started = Date.now()
    const result = generateOutfits({ wardrobe: grande, profile, context: { today: TODAY } })
    const elapsed = Date.now() - started

    expect(result.outfits.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(2000)
  })

  it('deja constancia de los filtros que tuvo que relajar', () => {
    const ayer = new Date(TODAY.getTime() - 86_400_000).toISOString()
    const result = generateOutfits({
      wardrobe: basicWardrobe().map((i) => ({ ...i, last_worn_at: ayer })),
      profile,
      context: { today: TODAY },
    })

    expect(result.relaxed).toContain('recently_worn')
    expect(result.outfits.length).toBeGreaterThan(0)
  })

  it('no propone colores vetados si hay alternativa', () => {
    const wardrobe = [
      ...basicWardrobe(),
      item({ id: 'rosa', category: 'tshirt', primary_color: 'pink' as Color }),
    ]
    const result = generateOutfits({
      wardrobe,
      profile,
      context: { today: TODAY },
      dislikedColors: ['pink'],
    })

    for (const outfit of result.outfits) {
      expect(outfit.items.map((i) => i.id)).not.toContain('rosa')
    }
  })
})
