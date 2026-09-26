import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import {
  assertPublicUrl,
  fetchPublicPage,
  PageUnavailableError,
  UnsafeUrlError,
} from '@/lib/net/safe-fetch'
import { parseProductPage, referenceFromUrl } from '@/lib/wardrobe/link'
import { checkRateLimit, rateLimitMessage, RATE_LIMITS } from '@/lib/security/rate-limit'

/**
 * Rellena la referencia a partir del enlace de una tienda.
 *
 * Dos caminos, y el orden importa:
 *
 *  1. **La direccion.** La referencia va dentro del propio enlace en las
 *     tiendas que se usan aqui. No tarda nada y no hay quien lo bloquee.
 *  2. **La pagina.** Anade el nombre del producto, el color y el precio, pero
 *     solo cuando la tienda deja leerse: Zara y El Corte Ingles contestan 403 a
 *     un servidor, y H&M y Uniqlo ni contestan. Que falle es lo normal, no un
 *     error, y por eso no rompe la respuesta.
 *
 * No gasta cupo de IA porque no hay IA. Si hay control de rafagas, porque el
 * segundo camino hace que nuestro servidor salga a internet.
 */
export const maxDuration = 15
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { url?: string } | null
  const url = typeof body?.url === 'string' ? body.url.trim() : ''

  if (!url || url.length > 2000) {
    return NextResponse.json({ error: 'Pega el enlace de la tienda.' }, { status: 400 })
  }

  try {
    // Se valida antes de nada: un enlace que apunta hacia dentro no se guarda
    // ni aunque no fueramos a leerlo.
    await assertPublicUrl(url)
  } catch (err) {
    const message =
      err instanceof UnsafeUrlError ? err.message : 'Eso no parece una dirección.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const rate = await checkRateLimit(user.id, RATE_LIMITS.readLink)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rateLimitMessage(rate) },
      { status: 429, headers: { 'retry-after': String(rate.resetInSeconds) } },
    )
  }

  const desdeElEnlace = referenceFromUrl(url)

  const reference = {
    brand: desdeElEnlace.brand,
    product_name: null as string | null,
    reference_code: desdeElEnlace.reference_code,
    brand_color: null as string | null,
    price_cents: null as number | null,
  }
  let finalUrl = url
  let leida = false

  try {
    const page = await fetchPublicPage(url)
    const parsed = parseProductPage(page.html, page.finalUrl)
    finalUrl = page.finalUrl
    leida = true

    // Lo de la pagina rellena huecos; lo de la direccion manda en la
    // referencia, que es el dato que la tienda casi nunca publica.
    reference.brand = desdeElEnlace.brand ?? parsed.brand
    reference.product_name = parsed.product_name
    reference.brand_color = parsed.brand_color
    reference.price_cents = parsed.price_cents
    reference.reference_code = desdeElEnlace.reference_code ?? parsed.reference_code
  } catch (err) {
    // Que la tienda no se deje leer es lo esperado y no se cuenta como fallo:
    // se devuelve lo que diga la direccion y la persona rellena el resto.
    if (!(err instanceof PageUnavailableError) && !(err instanceof UnsafeUrlError)) {
      console.error('[api/read-link] fallo inesperado:', err)
    }
  }

  return NextResponse.json({ reference, finalUrl, leida })
}
