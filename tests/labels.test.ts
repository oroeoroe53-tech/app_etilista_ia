import { describe, it, expect } from 'vitest'
import { describeGarment, colorLabel, CATEGORY_LABELS, COLOR_LABELS } from '@/lib/wardrobe/labels'
import { CATEGORY_LIST, COLORS, FITS, PATTERNS } from '@/lib/wardrobe/taxonomy'

/**
 * El español concuerda en género y número. Una plantilla que no lo haga escribe
 * "Jersey negra" y delata que detrás hay una máquina.
 */
describe('describeGarment', () => {
  it('concuerda en femenino singular', () => {
    expect(describeGarment({ category: 'tshirt', primary_color: 'black' })).toBe('Camiseta negra')
  })

  it('concuerda en masculino singular', () => {
    expect(describeGarment({ category: 'sweater', primary_color: 'black' })).toBe('Jersey negro')
  })

  it('concuerda en femenino plural', () => {
    expect(describeGarment({ category: 'sneakers', primary_color: 'white' })).toBe(
      'Zapatillas blancas',
    )
  })

  it('concuerda en masculino plural', () => {
    expect(describeGarment({ category: 'shoes', primary_color: 'brown' })).toBe('Zapatos marrones')
  })

  it('respeta los colores invariables', () => {
    expect(describeGarment({ category: 'jeans', primary_color: 'navy' })).toBe(
      'Vaqueros azul marino',
    )
    expect(describeGarment({ category: 'shirt', primary_color: 'beige' })).toBe('Camisa beis')
  })

  it('pluraliza los que solo cambian en número', () => {
    expect(describeGarment({ category: 'boots', primary_color: 'grey' })).toBe('Botas grises')
  })

  it('añade el corte concordado', () => {
    expect(describeGarment({ category: 'tshirt', primary_color: 'black', fit: 'oversized' })).toBe(
      'Camiseta negra oversize',
    )
    expect(describeGarment({ category: 'trousers', primary_color: 'black', fit: 'slim' })).toBe(
      'Pantalón negro entallado',
    )
  })

  it('omite el corte cuando no aporta nada', () => {
    expect(describeGarment({ category: 'tshirt', primary_color: 'black', fit: 'regular' })).toBe(
      'Camiseta negra',
    )
    expect(describeGarment({ category: 'tshirt', primary_color: 'black', fit: 'unknown' })).toBe(
      'Camiseta negra',
    )
  })

  it('omite "lisa": no distingue una prenda de otra', () => {
    expect(describeGarment({ category: 'tshirt', primary_color: 'black', pattern: 'solid' })).toBe(
      'Camiseta negra',
    )
  })

  it('sí menciona el estampado cuando distingue', () => {
    expect(describeGarment({ category: 'shirt', primary_color: 'blue', pattern: 'striped' })).toBe(
      'Camisa azul de rayas',
    )
  })

  it('no se rompe con una categoría desconocida', () => {
    expect(describeGarment({ category: 'inventado', primary_color: 'black' })).toBe('inventado')
  })
})

describe('cobertura de la taxonomía', () => {
  it('toda categoría tiene etiqueta, género y número', () => {
    for (const category of CATEGORY_LIST) {
      const noun = CATEGORY_LABELS[category]
      expect(noun, `falta la etiqueta de ${category}`).toBeDefined()
      expect(noun.label.length).toBeGreaterThan(0)
      expect(['m', 'f']).toContain(noun.gender)
      expect(['s', 'p']).toContain(noun.count)
    }
  })

  it('todo color tiene sus cuatro formas', () => {
    for (const color of COLORS) {
      const forms = COLOR_LABELS[color]
      expect(forms, `falta el color ${color}`).toBeDefined()
      for (const form of [forms.ms, forms.fs, forms.mp, forms.fp]) {
        expect(form.length).toBeGreaterThan(0)
      }
    }
  })

  it('ninguna combinación de la taxonomía produce texto vacío o "undefined"', () => {
    for (const category of CATEGORY_LIST) {
      for (const color of COLORS) {
        for (const fit of FITS) {
          for (const pattern of PATTERNS) {
            const text = describeGarment({
              category,
              primary_color: color,
              fit,
              pattern,
            })
            expect(text.length).toBeGreaterThan(0)
            expect(text).not.toContain('undefined')
            expect(text).not.toMatch(/\s{2,}/)
            expect(text.trim()).toBe(text)
          }
        }
      }
    }
  })

  it('las etiquetas sueltas de color van en mayúscula', () => {
    expect(colorLabel('black')).toBe('Negro')
    expect(colorLabel('navy')).toBe('Azul marino')
  })
})

describe('el estampado no se repite con el nombre', () => {
  it('unos vaqueros no son "vaqueros azules vaqueros"', () => {
    // `jeans` se llama "Vaqueros" y el estampado `denim` también es "vaquero".
    // Sin la comprobación, cada pantalón del armario lo decía dos veces.
    const nombre = describeGarment({
      category: 'jeans',
      primary_color: 'navy',
      pattern: 'denim',
      fit: 'regular',
    })
    expect(nombre).toBe('Vaqueros azul marino')
  })

  it('pero una chaqueta vaquera sí lo lleva', () => {
    // Aquí "vaquera" es justo lo que la distingue de las demás chaquetas.
    const nombre = describeGarment({
      category: 'jacket',
      primary_color: 'blue',
      pattern: 'denim',
      fit: 'regular',
    })
    expect(nombre.toLowerCase()).toContain('vaquera')
  })
})
