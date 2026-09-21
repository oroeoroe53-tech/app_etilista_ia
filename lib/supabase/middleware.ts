import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

/** Rutas accesibles sin sesión. */
/*
 * Lo público es lo que tiene que ver alguien que llega desde un anuncio y
 * todavía no tiene cuenta: la demostración, cómo instalarla, qué se hace con
 * sus fotos, y cómo recuperar la contraseña que ha olvidado. Pedir cuenta para
 * cualquiera de esas cuatro cosas sería pedir las dos difíciles a la vez.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/recuperar',
  '/auth',
  '/demo',
  '/instalar',
  /*
   * Las votaciones. Se ven sin cuenta a propósito: quien abre el enlace de una
   * amiga tiene que poder ver de qué va antes de que le pidamos nada. Para
   * VOTAR sí hace falta cuenta, y eso lo comprueba la acción, no esta lista.
   */
  '/v',
  // Las invitaciones al círculo, por el mismo motivo: hay que poder leer quién
  // te invita antes de que te pidamos una cuenta. Aceptar sí la exige.
  '/c',
  // Las invitaciones a un evento. Mismo motivo que las dos anteriores.
  '/e',
  '/privacidad',
  '/manifest.webmanifest',
  '/icons',
]

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Refresca la sesión en cada petición y protege las rutas privadas.
 *
 * El refresco tiene que ocurrir aquí porque los Server Components no pueden
 * escribir cookies; si no, la sesión caducaría silenciosamente.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const env = publicEnv()
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  /*
   * Si Supabase no responde (caída, red, proyecto pausado), se trata al visitante
   * como anónimo en vez de devolver un 500 en TODAS las páginas a la vez.
   * Las rutas privadas siguen protegidas: sin usuario, se redirige a /login.
   */
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (err) {
    console.error('[auth] no se ha podido validar la sesión:', err)
  }

  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  /*
   * El identificador ya validado, para que las pantallas no lo revaliden.
   *
   * `getUser()` no lee una cookie: pregunta a Supabase, y eso es un viaje de
   * ida y vuelta. Aquí ya se ha hecho, así que repetirlo en cada página era
   * pagar dos veces por la misma respuesta en **todas** las navegaciones.
   *
   * SEGURIDAD: la cabecera se escribe SIEMPRE, con valor o vacía. Esa es toda
   * la defensa: si alguien manda `x-estilista-uid` desde fuera, esta línea lo
   * pisa antes de que llegue a ninguna parte. Si algún día se pone dentro de un
   * `if`, una petición con esa cabecera se convierte en una sesión falsa —así
   * que no se pone dentro de un `if`.
   */
  const headers = new Headers(request.headers)
  headers.set('x-estilista-uid', user?.id ?? '')

  const forwarded = NextResponse.next({ request: { headers } })
  for (const cookie of response.cookies.getAll()) forwarded.cookies.set(cookie)
  return forwarded
}
