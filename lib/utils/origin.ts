import { headers } from 'next/headers'

/**
 * De dónde viene esta petición.
 *
 * Hace falta para construir el enlace que se manda por correo al recuperar la
 * contraseña. Se saca de las cabeceras en vez de una variable de entorno para
 * que funcione igual en local, en las vistas previas de Vercel y en
 * producción, sin tener que acordarse de configurar una más.
 *
 * La cabecera `host` se puede falsificar, pero aquí no abre ningún agujero:
 * Supabase solo acepta redirecciones que estén en su lista blanca, así que un
 * host inventado no genera un enlace válido, genera un error.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
