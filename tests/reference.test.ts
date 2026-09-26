import { describe, expect, it } from 'vitest'
import {
  EMPTY_REFERENCE,
  formatPrice,
  hasReference,
  referenceText,
  seasonLabel,
  storeHost,
  storeUrl,
  type GarmentReference,
} from '@/lib/wardrobe/reference'

const falda: GarmentReference = {
  brand: 'Zara',
  product_name: 'Falda midi plisada',
  reference_code: '2731/604/800',
  brand_color: 'arena',
  size: 'M',
  price_cents: 2995,
  bought_at: '2025-04-12',
  source_url: 'https://www.zara.com/es/es/falda-p2731604.html',
  reference_source: 'tag',
}

describe('hasReference', () => {
  it('una prenda sin nada no tiene referencia', () => {
    expect(hasReference(EMPTY_REFERENCE)).toBe(false)
  })

  it('basta la marca', () => {
    expect(hasReference({ ...EMPTY_REFERENCE, brand: 'Mango' })).toBe(true)
  })

  it('el precio y la fecha solos no cuentan', () => {
    // No responden a "de dónde es", que es el título de la tarjeta.
    expect(
      hasReference({ ...EMPTY_REFERENCE, price_cents: 2995, bought_at: '2025-04-12' }),
    ).toBe(false)
  })
})

describe('formatPrice', () => {
  it('céntimos a euros', () => {
    // El espacio antes del € que produce Intl no es un espacio normal.
    expect(formatPrice(2995)?.replace(/\u00a0/g, ' ')).toBe('29,95 €')
  })

  it('el cero es un precio', () => {
    expect(formatPrice(0)).not.toBeNull()
  })

  it('sin precio no hay texto', () => {
    expect(formatPrice(null)).toBeNull()
  })
})

describe('seasonLabel', () => {
  it('saca la temporada del mes', () => {
    expect(seasonLabel('2025-04-12')).toBe('primavera 2025')
    expect(seasonLabel('2025-07-01')).toBe('verano 2025')
    expect(seasonLabel('2025-10-30')).toBe('otoño 2025')
    expect(seasonLabel('2025-12-24')).toBe('invierno 2025')
  })

  it('el día 1 no se va al mes anterior', () => {
    // Con `new Date('2025-01-01')` y hora local española esto daba diciembre de
    // 2024: un `date` de Postgres no lleva zona y se interpretaba como UTC.
    expect(seasonLabel('2025-01-01')).toBe('invierno 2025')
  })

  it('lo que no sea una fecha no rompe la ficha', () => {
    expect(seasonLabel(null)).toBeNull()
    expect(seasonLabel('')).toBeNull()
    expect(seasonLabel('abril')).toBeNull()
    expect(seasonLabel('2025-13-01')).toBeNull()
  })
})

describe('referenceText', () => {
  it('tres líneas: qué es, el código, el enlace', () => {
    expect(referenceText(falda, 'Falda beige')).toBe(
      'Falda midi plisada — Zara\n' +
        'ref. 2731/604/800 · color arena · talla M\n' +
        'https://www.zara.com/es/es/falda-p2731604.html',
    )
  })

  it('sin nombre de tienda usa el nombre que le da la aplicación', () => {
    const text = referenceText({ ...falda, product_name: null }, 'Falda beige')
    expect(text.split('\n')[0]).toBe('Falda beige — Zara')
  })

  it('sin enlace se queda en dos líneas, y el código sigue estando', () => {
    const text = referenceText({ ...falda, source_url: null }, 'Falda beige')
    expect(text.split('\n')).toHaveLength(2)
    expect(text).toContain('ref. 2731/604/800')
  })

  it('con solo la marca no deja una línea de separadores huérfanos', () => {
    const text = referenceText(
      { ...EMPTY_REFERENCE, brand: 'Mango' },
      'Camisa blanca',
    )
    expect(text).toBe('Camisa blanca — Mango')
  })

  it('no deja espacios de campos que la persona dejó en blanco', () => {
    const text = referenceText(
      { ...falda, brand_color: '   ', size: '' },
      'Falda beige',
    )
    expect(text.split('\n')[1]).toBe('ref. 2731/604/800')
  })
})

describe('storeUrl', () => {
  it('devuelve el enlace que pegó la persona', () => {
    expect(storeUrl(falda)).toContain('zara.com')
  })

  it('no abre nada que no sea http o https', () => {
    // Un `javascript:` guardado en la base de datos no puede llegar a un href.
    expect(storeUrl({ ...falda, source_url: 'javascript:alert(1)' })).toBeNull()
    expect(storeUrl({ ...falda, source_url: 'data:text/html,<b>x' })).toBeNull()
  })

  it('un texto que no es una dirección no da botón', () => {
    expect(storeUrl({ ...falda, source_url: 'no me acuerdo' })).toBeNull()
    expect(storeUrl({ ...falda, source_url: null })).toBeNull()
  })
})

describe('storeHost', () => {
  it('se queda con el dominio, sin www', () => {
    expect(storeHost('https://www.zara.com/es/es/falda.html')).toBe('zara.com')
  })

  it('con una dirección ilegible no escribe basura en el botón', () => {
    expect(storeHost('???')).toBe('la tienda')
  })
})
