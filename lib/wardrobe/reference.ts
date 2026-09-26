/**
 * La referencia de una prenda.
 *
 * Lo que una persona quiere decir cuando pide "la referencia" no es la marca:
 * es el código de la etiqueta, que escrito en el buscador de la tienda lleva a
 * esa prenda exacta. Decir "es de Zara" deja a quien pregunta buscando entre
 * cuarenta camisas blancas.
 *
 * Aquí no hay nada de base de datos ni de React a propósito: son funciones
 * puras, y por eso se pueden probar sin montar nada.
 */

export interface GarmentReference {
  brand: string | null
  product_name: string | null
  reference_code: string | null
  brand_color: string | null
  size: string | null
  price_cents: number | null
  /** `YYYY-MM-DD`, tal y como lo devuelve Postgres para un `date`. */
  bought_at: string | null
  source_url: string | null
  reference_source: 'tag' | 'link' | 'manual' | null
}

export const EMPTY_REFERENCE: GarmentReference = {
  brand: null,
  product_name: null,
  reference_code: null,
  brand_color: null,
  size: null,
  price_cents: null,
  bought_at: null,
  source_url: null,
  reference_source: null,
}

/**
 * ¿Hay algo que mostrar?
 *
 * El precio y la fecha solos no cuentan: son datos del historial de la persona,
 * no sirven para que nadie encuentre la prenda, y una tarjeta titulada "de dónde
 * es" que solo dice "29,95 €" no responde a la pregunta.
 */
export function hasReference(ref: GarmentReference): boolean {
  return Boolean(ref.brand || ref.product_name || ref.reference_code || ref.source_url)
}

/** "29,95 €". En euros porque es donde se usa; el día que haga falta otra, será un campo más. */
export function formatPrice(cents: number | null): string | null {
  if (cents === null || !Number.isFinite(cents)) return null
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

const SEASON_BY_MONTH = [
  'invierno', // enero
  'invierno',
  'primavera',
  'primavera',
  'primavera',
  'verano',
  'verano',
  'verano',
  'otoño',
  'otoño',
  'otoño',
  'invierno', // diciembre
] as const

/**
 * "primavera 2025" a partir de la fecha de compra.
 *
 * Se lee partiendo el texto en vez de con `new Date()`: un `date` de Postgres no
 * lleva hora, y construir un Date con él lo interpreta en UTC, así que en España
 * el día 1 de cualquier mes se convertía en el último del mes anterior —y en
 * enero, del año anterior.
 */
export function seasonLabel(isoDate: string | null): string | null {
  if (!isoDate) return null
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null

  return `${SEASON_BY_MONTH[month - 1]} ${year}`
}

/**
 * El texto que se copia para pegárselo a una amiga por WhatsApp.
 *
 * Tres líneas, y el orden es el importante: qué es, el código —que sobrevive a
 * que la tienda retire el producto—, y el enlace, que es lo primero que caduca.
 * Si el enlace ya está muerto, con el código se busca en Vinted, que es la mitad
 * de las veces.
 *
 * `fallbackName` es el nombre que la aplicación le da a la prenda ("Camisa
 * blanca"), para cuando no se sabe cómo la llama la tienda.
 */
export function referenceText(ref: GarmentReference, fallbackName: string): string {
  const lines: string[] = []

  const what = ref.product_name?.trim() || fallbackName.trim()
  lines.push(ref.brand?.trim() ? `${what} — ${ref.brand.trim()}` : what)

  const details = [
    ref.reference_code?.trim() ? `ref. ${ref.reference_code.trim()}` : null,
    ref.brand_color?.trim() ? `color ${ref.brand_color.trim()}` : null,
    ref.size?.trim() ? `talla ${ref.size.trim()}` : null,
  ].filter((part): part is string => part !== null)

  if (details.length > 0) lines.push(details.join(' · '))

  const url = ref.source_url?.trim()
  if (url) lines.push(url)

  return lines.join('\n')
}

/**
 * Solo se abre lo que la propia persona pegó.
 *
 * La tentación era montar el buscador de cada tienda a partir del código, pero
 * los parámetros de búsqueda de Zara y Mango no he podido comprobarlos, y un
 * botón que lleva a un 404 es peor que no tener botón: el código está ahí al
 * lado para copiarlo y pegarlo en la tienda, que es lo que se hace igualmente.
 *
 * Se exige http/https para que un `javascript:` guardado en la base de datos no
 * pueda ejecutarse al tocar el botón.
 */
export function storeUrl(ref: GarmentReference): string | null {
  const raw = ref.source_url?.trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

/** "zara.com", para escribirlo en el botón en vez de una dirección de 200 caracteres. */
export function storeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'la tienda'
  }
}
