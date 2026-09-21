import { cookies, headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Sigue usando la clave anónima, así que RLS sigue aplicándose: este cliente
 * representa al usuario, no al sistema.
 */
export async function createClient() {
  const env = publicEnv()
  const cookieStore = await cookies()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Los Server Components no pueden escribir cookies. El refresco de sesión
          // lo hace el middleware, así que aquí se puede ignorar sin riesgo.
        }
      },
    },
  })
}

/**
 * Devuelve el usuario autenticado o `null`.
 * Usa `getUser()` (valida el token contra Supabase) y no `getSession()`,
 * que se limita a leer la cookie y por tanto es falsificable.
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Igual que `getCurrentUser`, pero lanza si no hay sesión. Para código de servidor. */
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return user
}

/**
 * El identificador del usuario, sin volver a preguntárselo a Supabase.
 *
 * Lo deja el proxy en una cabecera después de validar la sesión (ver
 * `lib/supabase/middleware.ts`). Como esa validación ya ha ocurrido en esta
 * misma petición, llamar otra vez a `getUser()` era un viaje de ida y vuelta
 * regalado en cada navegación.
 *
 * La cabecera la escribe siempre el proxy, así que una enviada desde fuera se
 * pisa antes de llegar aquí. Aun así, si faltara —una ruta que el proxy no
 * cubra, o un cambio futuro en el `matcher`— se cae con elegancia a preguntar
 * de verdad: preferimos una página lenta a una página que se cree a quien no
 * debe.
 */
export async function getUserId(): Promise<string | null> {
  const fromProxy = (await headers()).get('x-estilista-uid')
  if (fromProxy) return fromProxy

  const user = await getCurrentUser()
  return user?.id ?? null
}

/** Igual, pero lanza. Para código de servidor que ya está detrás del proxy. */
export async function requireUserId(): Promise<string> {
  const id = await getUserId()
  if (!id) throw new Error('UNAUTHENTICATED')
  return id
}
