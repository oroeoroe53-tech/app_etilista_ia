import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Descargar una página que ha pedido un usuario.
 *
 * **Por qué esto no es un `fetch` a secas.**
 *
 * Pedirle al servidor que abra una dirección que escribe otra persona es la
 * puerta de atrás clásica: el servidor está *dentro*, así que llega a sitios a
 * los que nadie llega desde fuera. `http://169.254.169.254/` son las claves de
 * la máquina en media nube del mundo, y `http://127.0.0.1:6379` es una base de
 * datos sin contraseña porque "solo escucha en local". Sin comprobar a dónde se
 * va, la aplicación se convierte en el recadero de quien pegue el enlace.
 *
 * Así que antes de pedir nada se resuelve el nombre a su dirección y se mira si
 * esa dirección es interna. Y se vuelve a mirar en cada redirección, porque una
 * web puede contestar "sigue por aquí" y mandarte a casa.
 *
 * **Lo que esto no cubre, dicho claramente.** Entre que se resuelve el nombre y
 * se pide la página, un servidor de nombres hostil puede cambiar la respuesta y
 * colar una dirección interna. Taparlo exige montar el socket a mano. No lo he
 * hecho porque aquí quien pega enlaces es la dueña de su propio armario, y el
 * agujero pediría que se atacara a sí misma; si esto llega a aceptar enlaces de
 * desconocidos, hay que volver aquí antes.
 */

const MAX_REDIRECTS = 3
const TIMEOUT_MS = 8000
/** Con 512 KB sobra: lo que se busca está en la cabecera del documento. */
const MAX_BYTES = 512 * 1024

/** La direccion no se puede pedir: el enlace no vale o apunta hacia dentro. */
export class UnsafeUrlError extends Error {}

/**
 * La pagina existe pero no se ha podido leer.
 *
 * Separado de la anterior a proposito. Las tiendas grandes bloquean a los
 * servidores —Zara y El Corte Ingles contestan 403, H&M y Uniqlo ni contestan—
 * y eso no es un fallo de nadie ni un motivo para rechazar el enlace: se guarda
 * lo que se sepa por la direccion y se sigue.
 */
export class PageUnavailableError extends Error {}

/** Rangos que no son de internet: local, privados, enlace-local y reservados. */
function isInternalIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true // Si no se entiende, no se va.
  }
  const [a, b] = parts
  if (a === undefined || b === undefined) return true

  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // metadatos de la nube
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true // multicast y reservados
  return false
}

/**
 * En IPv6 se hace al reves: solo se deja pasar lo que es de internet.
 *
 * Enumerar los rangos malos no funciono. `http://[::ffff:127.0.0.1]/` lo
 * normaliza `new URL` a `[::ffff:7f00:1]`, en hexadecimal, y la comprobacion
 * escrita para la forma con puntos no lo reconocia: 127.0.0.1 pasaba como
 * direccion publica. Lo encontro la prueba de aqui al lado.
 *
 * El unico rango de internet en IPv6 es 2000::/3, o sea, el que empieza por 2 o
 * por 3. Todo lo demas —lo local, lo unico local, el enlace-local, las IPv4
 * disfrazadas en cualquiera de sus formas— queda fuera sin tener que acertar a
 * enumerarlo. Es mas estrecho, y esa es la idea: aqui equivocarse de menos
 * rompe un enlace, y equivocarse de mas abre el servidor.
 */
function isInternalIPv6(ip: string): boolean {
  const address = (ip.toLowerCase().split('%')[0] ?? '').replace(/^\[|\]$/g, '')
  return !/^[23]/.test(address)
}

function isInternal(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isInternalIPv4(ip)
  if (version === 6) return isInternalIPv6(ip)
  return true
}

/**
 * Comprueba que una dirección se puede pedir, y devuelve la URL ya normalizada.
 *
 * Exporta aparte de la descarga para poder probarla sin red.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError('Eso no parece una dirección.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Solo puedo abrir enlaces http o https.')
  }

  // Un `https://usuario:clave@tienda.com` mandaría credenciales a saber dónde.
  if (url.username || url.password) {
    throw new UnsafeUrlError('Quita el usuario y la contraseña del enlace.')
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')

  // Una dirección escrita a pelo se comprueba sin preguntar a nadie.
  if (isIP(host)) {
    if (isInternal(host)) throw new UnsafeUrlError('Esa dirección no es pública.')
    return url
  }

  let resolved: { address: string }[]
  try {
    resolved = await lookup(host, { all: true })
  } catch {
    throw new UnsafeUrlError('No he encontrado esa página.')
  }

  // Basta con que UNA de las direcciones sea interna para no ir: si el nombre
  // devuelve varias, no se controla con cuál se queda el sistema.
  if (resolved.length === 0 || resolved.some((entry) => isInternal(entry.address))) {
    throw new UnsafeUrlError('Esa dirección no es pública.')
  }

  return url
}

export interface FetchedPage {
  html: string
  /** A dónde se acabó llegando: es lo que se guarda como enlace. */
  finalUrl: string
}

/**
 * Descarga el HTML de una página pública.
 *
 * Las redirecciones se siguen a mano —`redirect: 'manual'`— para poder validar
 * cada salto. Con el `fetch` normal, la comprobación de la primera dirección no
 * serviría de nada: bastaría con que la tienda contestara "sigue en 127.0.0.1".
 */
export async function fetchPublicPage(raw: string): Promise<FetchedPage> {
  let target = await assertPublicUrl(raw)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Sin esto media tienda contesta con una página vacía.
        'user-agent':
          'Mozilla/5.0 (compatible; Selyqo/1.0; +https://selyqo.vercel.app)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'es-ES,es;q=0.9',
      },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new PageUnavailableError('No he podido abrir esa página.')
      target = await assertPublicUrl(new URL(location, target).toString())
      continue
    }

    if (!response.ok) {
      throw new PageUnavailableError('La tienda no me ha dejado leer esa página.')
    }

    const type = response.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/i.test(type)) {
      throw new PageUnavailableError('Ese enlace no es una página de producto.')
    }

    return { html: await readCapped(response), finalUrl: target.toString() }
  }

  throw new PageUnavailableError('Ese enlace da demasiadas vueltas.')
}

/**
 * Lee como mucho `MAX_BYTES` y corta.
 *
 * Fiarse de `content-length` no vale: puede mentir o no venir. Sin este tope,
 * un servidor que devuelva un chorro infinito llena la memoria del proceso.
 */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder('utf-8')
  let html = ''
  let bytes = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      html += decoder.decode(value, { stream: true })
      if (bytes >= MAX_BYTES) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  return html
}
