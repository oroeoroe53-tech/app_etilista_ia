import type { GarmentReference } from './reference'

/**
 * Leer la ficha de producto de una tienda.
 *
 * Las tiendas publican sus productos dentro del propio HTML para que Google y
 * las redes sociales los entiendan: un bloque JSON-LD de tipo `Product` y, casi
 * siempre, etiquetas Open Graph. Eso trae marca, nombre, **referencia** y precio
 * sin que nadie escriba nada.
 *
 * Aquí no se pide nada por la red: entra el HTML y sale la referencia. La
 * descarga, que es la parte delicada, vive en `lib/net/safe-fetch.ts`.
 *
 * Todo lo que sale de aquí es texto de una web ajena. Se recorta, se le quitan
 * los saltos de línea y los caracteres de control, y nunca se interpreta: llega
 * a la pantalla como texto de React, que se escapa solo.
 */

type Parsed = Pick<
  GarmentReference,
  'brand' | 'product_name' | 'reference_code' | 'brand_color' | 'price_cents'
>

const EMPTY: Parsed = {
  brand: null,
  product_name: null,
  reference_code: null,
  brand_color: null,
  price_cents: null,
}

/** Recorta, aplana y descarta lo que no sirva. `max` es el límite de la columna. */
function clean(value: unknown, max: number): string | null {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value
  if (typeof raw !== 'string') return null

  const text = raw
    // Los saltos de línea de un título ajeno romperían el texto de tres líneas
    // que se copia para WhatsApp.
    .replace(/\s+/g, ' ')
    // Caracteres de control: no se ven, y ensucian lo que se pega.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()

  return text.length > 0 ? text.slice(0, max) : null
}

/**
 * "29,95", "29.95", "EUR 29.95" o 29.95 → 2995.
 *
 * La coma y el punto se turnan según el país y las tiendas españolas usan las
 * dos. Se decide por cuál va en último lugar: en "1.299,00" los decimales los
 * marca la coma, y en "1,299.00" el punto.
 */
export function priceToCents(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : null
  }
  if (typeof raw !== 'string') return null

  const digits = raw.replace(/[^\d.,]/g, '')
  if (!/\d/.test(digits)) return null

  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')
  const separator = Math.max(lastComma, lastDot)

  let normalized: string
  if (separator === -1) {
    normalized = digits
  } else if (digits.length - separator - 1 === 3) {
    // Tres cifras detrás del separador son los miles ("1.299"), no céntimos.
    normalized = digits.replace(/[.,]/g, '')
  } else {
    const entero = digits.slice(0, separator).replace(/[.,]/g, '')
    normalized = entero + '.' + digits.slice(separator + 1)
  }

  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

/** Solo las cinco entidades que el estándar obliga a escapar; no hace falta más. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** `<meta property="og:title" content="…">`, en cualquier orden de atributos. */
function meta(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      '<meta[^>]+(?:property|name)\\s*=\\s*["\']' +
        escaped +
        '["\'][^>]*?content\\s*=\\s*["\']([^"\']*)["\']',
      'i',
    ),
    new RegExp(
      '<meta[^>]+content\\s*=\\s*["\']([^"\']*)["\'][^>]*?(?:property|name)\\s*=\\s*["\']' +
        escaped +
        '["\']',
      'i',
    ),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match?.[1] !== undefined) return decodeEntities(match[1])
  }
  return null
}

interface JsonLdNode {
  '@type'?: unknown
  '@graph'?: unknown
  name?: unknown
  sku?: unknown
  mpn?: unknown
  productID?: unknown
  color?: unknown
  brand?: unknown
  offers?: unknown
  mainEntity?: unknown
  itemListElement?: unknown
}

/** Un `@type` puede ser "Product" o ["Product", "Thing"]. */
function isProduct(node: JsonLdNode): boolean {
  const type = node['@type']
  const types = Array.isArray(type) ? type : [type]
  return types.some((t) => typeof t === 'string' && /product/i.test(t))
}

/**
 * Busca el nodo `Product` dentro del JSON-LD.
 *
 * Se baja por `@graph` y por los arrays porque cada tienda lo anida a su manera.
 * Con límite de profundidad: un JSON preparado a mala fe podría venir anidado
 * diez mil niveles y dejar al servidor dando vueltas.
 */
function findProduct(value: unknown, depth = 0): JsonLdNode | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProduct(entry, depth + 1)
      if (found) return found
    }
    return null
  }

  const node = value as JsonLdNode
  if (isProduct(node)) return node

  for (const key of ['@graph', 'mainEntity', 'itemListElement'] as const) {
    const found = findProduct(node[key], depth + 1)
    if (found) return found
  }
  return null
}

function brandName(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const name = (raw as { name?: unknown }).name
    if (typeof name === 'string') return name
  }
  return null
}

function offerPrice(raw: unknown): unknown {
  const offer = Array.isArray(raw) ? raw[0] : raw
  if (offer && typeof offer === 'object') {
    const o = offer as { price?: unknown; lowPrice?: unknown }
    return o.price ?? o.lowPrice ?? null
  }
  return null
}

/**
 * La referencia dentro de la ficha.
 *
 * `productID` a veces viene como "sku:12345", así que se le quita el prefijo:
 * lo que se pega en el buscador de la tienda es el número.
 */
function referenceCode(node: JsonLdNode): unknown {
  const raw = node.sku ?? node.mpn ?? node.productID
  if (typeof raw === 'string') return raw.replace(/^[a-z_]+\s*:\s*/i, '')
  return raw
}

/**
 * Saca la referencia del HTML de una ficha de producto.
 *
 * Nunca lanza: una tienda que no publique nada legible devuelve campos vacíos y
 * la persona los rellena a mano, que es lo que hacía antes igualmente.
 */
export function parseProductPage(html: string, finalUrl: string): Parsed {
  const out: Parsed = { ...EMPTY }

  // 1. JSON-LD, que es donde está la referencia.
  const blocks = html.matchAll(
    /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )

  for (const block of blocks) {
    const json = block[1]
    if (!json) continue

    let data: unknown
    try {
      data = JSON.parse(json.trim())
    } catch {
      // Una tienda con el JSON mal formado no puede tumbar la lectura entera.
      continue
    }

    const product = findProduct(data)
    if (!product) continue

    out.product_name = clean(product.name, 120)
    out.reference_code = clean(referenceCode(product), 60)
    out.brand_color = clean(product.color, 40)
    out.brand = clean(brandName(product.brand), 60)
    out.price_cents = priceToCents(offerPrice(product.offers))
    break
  }

  // 2. Open Graph rellena los huecos. Referencia no trae casi nunca.
  out.product_name ??= clean(meta(html, 'og:title'), 120)
  out.brand ??= clean(meta(html, 'og:site_name'), 60)
  out.price_cents ??= priceToCents(
    meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount'),
  )

  /*
   * El titulo de la pestaña NO vale como nombre del producto.
   *
   * Shein contesta a un servidor, pero con una pagina generica en vez de la
   * ficha, y de ahi salia "Ropa de Mujer y Hombre, Comprar Moda Online | SHEIN"
   * metido en el nombre de la prenda. Si una pagina no publica ni JSON-LD ni
   * Open Graph, no es que tenga el nombre en otro sitio: es que no hemos leido
   * su ficha. Mas vale el campo vacio que basura que hay que borrar a mano.
   */

  if (!out.brand) {
    try {
      // "es.shein.com" → "Shein", no "Es". Se coge la etiqueta del dominio, no
      // la primera, que en media tienda es el pais.
      const labels = new URL(finalUrl).hostname.split('.').filter(Boolean)
      const label = (labels.length > 1 ? labels[labels.length - 2] : labels[0]) ?? ''
      out.brand = clean(label.charAt(0).toUpperCase() + label.slice(1), 60)
    } catch {
      out.brand = null
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// La referencia dentro de la propia direccion
// ---------------------------------------------------------------------------

/**
 * Sacar la referencia del enlace, sin pedir nada por la red.
 *
 * **Por que esto existe.** Lo primero que monte fue leer el HTML de la ficha, y
 * al probarlo contra tiendas de verdad salio esto: Zara y El Corte Ingles
 * contestan 403 a un servidor, y H&M y Uniqlo ni contestan. Bloquean el trafico
 * que no viene de un navegador, y en produccion sera peor, porque la direccion
 * de un servidor en la nube se reconoce a la legua.
 *
 * Mirando las direcciones que habia probado aparecio lo importante: **la
 * referencia va dentro del propio enlace**. `...-p00722302.html` en Zara,
 * `..._87005771` en Mango, `productpage.1227537001.html` en H&M. Eso no hay
 * quien lo bloquee, no tarda nada y no saca al servidor a internet.
 *
 * Es lo primero que se prueba, y leer la pagina pasa a ser el complemento que
 * anade nombre y precio cuando la tienda deja.
 */
interface PatronDeTienda {
  /** Dominio, sin `www`. Vale tambien para los subdominios de pais. */
  host: RegExp
  marca: string
  /** Se prueba contra la RUTA, no contra la direccion entera. El primer grupo es el codigo. */
  codigo: RegExp
}

/**
 * El codigo se busca SOLO en la ruta, nunca en la parte de consulta.
 *
 * El enlace real de Zara que me paso Ana acababa en
 * `?v1=596960515&v2=2417772`: nueve cifras que cualquier patron algo flojo
 * cogeria por referencia, y la buena estaba en la ruta.
 *
 * Y los patrones van anclados al final de la ruta, con el `.html` opcional. La
 * ficha de Massimo Dutti termina en `-l05041741`, sin `.html`, y exigirlo
 * dejaba esa tienda sin leer. Dentro del grupo Inditex conviven tres formas
 * —`-p`, `-l` y `-c0p`— asi que el patron acepta las tres.
 */
const INDITEX = /-(?:c\d+)?[lp](\d{6,12})(?:\.html)?$/i

const TIENDAS: readonly PatronDeTienda[] = [
  { host: /(^|\.)zara\.com$/i, marca: 'Zara', codigo: INDITEX },
  { host: /(^|\.)massimodutti\.com$/i, marca: 'Massimo Dutti', codigo: INDITEX },
  { host: /(^|\.)bershka\.com$/i, marca: 'Bershka', codigo: INDITEX },
  { host: /(^|\.)stradivarius\.com$/i, marca: 'Stradivarius', codigo: INDITEX },
  { host: /(^|\.)pullandbear\.com$/i, marca: 'Pull&Bear', codigo: INDITEX },
  { host: /(^|\.)oysho\.com$/i, marca: 'Oysho', codigo: INDITEX },

  { host: /(^|\.)mango\.com$/i, marca: 'Mango', codigo: /_(\d{6,10})(?:\.html)?$/ },
  { host: /(^|\.)hm\.com$/i, marca: 'H&M', codigo: /productpage\.(\d{8,12})\.html$/i },
  { host: /(^|\.)uniqlo\.com$/i, marca: 'Uniqlo', codigo: /\/products\/([A-Z]\d{6}-\d{3})$/i },
  { host: /(^|\.)shein\.com$/i, marca: 'Shein', codigo: /-p-(\d{6,12})(?:\.html)?$/i },
]

export interface DesdeElEnlace {
  brand: string | null
  reference_code: string | null
}

/**
 * Lee marca y referencia de la direccion. Nunca lanza ni pide nada.
 *
 * Para una tienda que no este en la lista devuelve los dos campos vacios: mas
 * vale no poner nada que poner un numero cogido al azar de la direccion, porque
 * ese numero acabaria pegado en el buscador de la tienda de una amiga.
 */
export function referenceFromUrl(raw: string): DesdeElEnlace {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { brand: null, reference_code: null }
  }

  const host = url.hostname.replace(/^www\d*\./i, '')
  const tienda = TIENDAS.find((t) => t.host.test(host))
  if (!tienda) return { brand: null, reference_code: null }

  const match = tienda.codigo.exec(url.pathname)
  return {
    brand: tienda.marca,
    reference_code: match?.[1] ?? null,
  }
}
