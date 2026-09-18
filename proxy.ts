import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { hasSupabaseConfig } from '@/lib/env'

/**
 * Next 16 sustituyó el archivo `middleware.ts` por `proxy.ts`.
 * El cometido es el mismo: refrescar la sesión de Supabase en cada petición
 * y redirigir a `/login` lo que no sea público.
 */
export function proxy(request: NextRequest) {
  // Proyecto recién clonado y sin `.env.local`: en vez de un error 500 opaco,
  // se enseña qué falta por configurar.
  if (!hasSupabaseConfig()) {
    if (request.nextUrl.pathname === '/configurar') return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = '/configurar'
    url.search = ''
    return NextResponse.rewrite(url)
  }

  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     *  - _next/static, _next/image  (assets del build)
     *  - favicon, iconos, sw.js     (PWA)
     *  - archivos con extensión     (imágenes, fuentes…)
     */
    '/((?!_next/static|_next/image|favicon.ico|favicon.png|icons/|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
