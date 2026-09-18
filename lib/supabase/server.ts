import { cookies } from 'next/headers'
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
