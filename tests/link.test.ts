import { describe, expect, it } from 'vitest'
import { parseProductPage, priceToCents, referenceFromUrl } from '@/lib/wardrobe/link'

/** Una ficha como la publican de verdad las tiendas. */
function page(jsonLd: unknown, extra = ''): string {
  return `<!doctype html><html><head><title>Falda | Zara</title>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    ${extra}</head><body>…</body></html>`
}

const PRODUCTO = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Falda midi plisada',
  sku: '2731/604/800',
  color: 'arena',
  brand: { '@type': 'Brand', name: 'Zara' },
  offers: { '@type': 'Offer', price: '29.95', priceCurrency: 'EUR' },
}

describe('priceToCents', () => {
  it('lee los dos formatos que usan las tiendas españolas', () => {
    expect(priceToCents('29,95')).toBe(2995)
    expect(priceToCents('29.95')).toBe(2995)
    expect(priceToCents(29.95)).toBe(2995)
    expect(priceToCents('29,95 €')).toBe(2995)
    expect(priceToCents('EUR 29.95')).toBe(2995)
  })

  it('distingue los miles de los céntimos', () => {
    expect(priceToCents('1.299,00')).toBe(129900)
    expect(priceToCents('1,299.00')).toBe(129900)
    // Tres cifras detrás del separador son miles, no céntimos.
    expect(priceToCents('1.299')).toBe(129900)
  })

  it('un precio sin decimales es un precio', () => {
    expect(priceToCents('30')).toBe(3000)
    expect(priceToCents(0)).toBe(0)
  })

  it('lo que no es un precio no lo es', () => {
    expect(priceToCents('agotado')).toBeNull()
    expect(priceToCents(null)).toBeNull()
    expect(priceToCents(-5)).toBeNull()
    expect(priceToCents({})).toBeNull()
  })
})

describe('parseProductPage', () => {
  it('saca la referencia entera del JSON-LD', () => {
    const ref = parseProductPage(page(PRODUCTO), 'https://www.zara.com/es/falda.html')

    expect(ref).toEqual({
      brand: 'Zara',
      product_name: 'Falda midi plisada',
      reference_code: '2731/604/800',
      brand_color: 'arena',
      price_cents: 2995,
    })
  })

  it('encuentra el producto dentro de un @graph', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'WebSite', name: 'Zara' }, PRODUCTO],
    })
    expect(parseProductPage(html, 'https://zara.com/x').reference_code).toBe('2731/604/800')
  })

  it('acepta un @type en lista', () => {
    const html = page({ ...PRODUCTO, '@type': ['Product', 'Thing'] })
    expect(parseProductPage(html, 'https://zara.com/x').product_name).toBe(
      'Falda midi plisada',
    )
  })

  it('le quita el prefijo a un productID tipo "sku:12345"', () => {
    const html = page({
      '@type': 'Product',
      name: 'Camisa',
      productID: 'sku:07901305800',
    })
    expect(parseProductPage(html, 'https://x.com/y').reference_code).toBe('07901305800')
  })

  it('usa mpn cuando no hay sku', () => {
    const html = page({ '@type': 'Product', name: 'Camisa', mpn: 'AB-12' })
    expect(parseProductPage(html, 'https://x.com/y').reference_code).toBe('AB-12')
  })

  it('coge el primer precio cuando las ofertas son varias', () => {
    const html = page({
      '@type': 'Product',
      name: 'Camisa',
      offers: [{ price: '19,99' }, { price: '24,99' }],
    })
    expect(parseProductPage(html, 'https://x.com/y').price_cents).toBe(1999)
  })

  it('un JSON-LD roto no tumba la lectura: sigue al siguiente bloque', () => {
    const html = `<html><head>
      <script type="application/ld+json">{ esto no es json }</script>
      <script type="application/ld+json">${JSON.stringify(PRODUCTO)}</script>
      </head><body></body></html>`
    expect(parseProductPage(html, 'https://zara.com/x').reference_code).toBe('2731/604/800')
  })

  it('sin JSON-LD se apaña con Open Graph', () => {
    const html = `<html><head>
      <meta property="og:title" content="Pantalón de lino">
      <meta property="og:site_name" content="Massimo Dutti">
      <meta property="product:price:amount" content="59.95">
      </head><body></body></html>`

    const ref = parseProductPage(html, 'https://www.massimodutti.com/es/p.html')
    expect(ref.product_name).toBe('Pantalón de lino')
    expect(ref.brand).toBe('Massimo Dutti')
    expect(ref.price_cents).toBe(5995)
    // Open Graph no trae referencia, y no se la inventa.
    expect(ref.reference_code).toBeNull()
  })

  it('lee la etiqueta con los atributos al revés', () => {
    const html = '<html><head><meta content="Camisa oxford" property="og:title"></head></html>'
    expect(parseProductPage(html, 'https://x.com/y').product_name).toBe('Camisa oxford')
  })

  it('sin nada, el título de la pestaña y el dominio como marca', () => {
    const html = '<html><head><title>Falda plisada &amp; corta</title></head></html>'
    const ref = parseProductPage(html, 'https://www.bershka.com/es/falda.html')

    expect(ref.product_name).toBe('Falda plisada & corta')
    expect(ref.brand).toBe('Bershka')
  })

  it('una página sin nada legible no rompe: todo vacío', () => {
    const ref = parseProductPage('<html><body>hola</body></html>', 'no es una url')
    expect(ref.product_name).toBeNull()
    expect(ref.reference_code).toBeNull()
    expect(ref.brand).toBeNull()
  })

  it('aplana los saltos de línea de un título ajeno', () => {
    // Si no, romperían el texto de tres líneas que se copia para WhatsApp.
    const html = page({ '@type': 'Product', name: 'Falda\n  midi\tplisada' })
    expect(parseProductPage(html, 'https://x.com/y').product_name).toBe('Falda midi plisada')
  })

  it('recorta lo que no cabe en la columna', () => {
    const html = page({ '@type': 'Product', name: 'x'.repeat(400) })
    expect(parseProductPage(html, 'https://x.com/y').product_name).toHaveLength(120)
  })

  it('un nombre que solo son espacios cuenta como vacío', () => {
    const html = page({ '@type': 'Product', name: '   ', sku: 'A1' })
    // Cae al título de la pestaña, que es lo que hay.
    expect(parseProductPage(html, 'https://x.com/y').product_name).toBe('Falda | Zara')
  })

  it('no se cuelga con un JSON anidado a mala fe', () => {
    let nested: unknown = { '@type': 'Product', name: 'escondida' }
    for (let i = 0; i < 2000; i++) nested = { '@graph': nested }

    const inicio = Date.now()
    const ref = parseProductPage(page(nested), 'https://x.com/y')
    expect(Date.now() - inicio).toBeLessThan(1000)
    // Se deja de buscar antes de encontrarlo: es el precio de no colgarse.
    expect(ref.reference_code).toBeNull()
  })
})

describe('referenceFromUrl', () => {
  it('saca la referencia del enlace de cada tienda', () => {
    const casos: [string, string, string][] = [
      ['https://www.zara.com/es/es/camisa-popelin-p00722302.html', 'Zara', '00722302'],
      ['https://shop.mango.com/es/es/p/mujer/camisas/camisa-lisa_87005771', 'Mango', '87005771'],
      ['https://www2.hm.com/es_es/productpage.1227537001.html', 'H&M', '1227537001'],
      ['https://www.uniqlo.com/es/es/products/E475297-000', 'Uniqlo', 'E475297-000'],
      ['https://www.bershka.com/es/camisa-c0p148925612.html', 'Bershka', '148925612'],
    ]

    for (const [url, marca, codigo] of casos) {
      expect(referenceFromUrl(url), url).toEqual({
        brand: marca,
        reference_code: codigo,
      })
    }
  })

  it('reconoce la tienda aunque el enlace sea de otro pais', () => {
    expect(referenceFromUrl('https://www.zara.com/fr/fr/chemise-p00722302.html').brand).toBe(
      'Zara',
    )
  })

  it('una tienda conocida sin codigo en el enlace da la marca y nada mas', () => {
    // Un enlace a la portada, o a una categoria.
    expect(referenceFromUrl('https://www.zara.com/es/es/mujer-camisas-l1217.html')).toEqual({
      brand: 'Zara',
      reference_code: null,
    })
  })

  it('una tienda que no esta en la lista no inventa un codigo', () => {
    // Coger cifras al azar de la direccion mandaria a una amiga a buscar un
    // numero que no significa nada.
    expect(referenceFromUrl('https://tienda-rara.com/producto/123456789')).toEqual({
      brand: null,
      reference_code: null,
    })
  })

  it('un texto que no es una direccion no rompe nada', () => {
    expect(referenceFromUrl('no me acuerdo')).toEqual({
      brand: null,
      reference_code: null,
    })
  })

  it('no confunde un dominio que acaba parecido', () => {
    // "nozara.com" no es Zara.
    expect(referenceFromUrl('https://nozara.com/x-p00722302.html').brand).toBeNull()
  })
})
