'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requestOrigin } from '@/lib/utils/origin'
import { track } from '@/lib/observability/funnel'

/**
 * Acciones de autenticación.
 *
 * Los mensajes de error se devuelven en español y sin detalles del proveedor:
 * decir "este correo no existe" es regalar información sobre quién está dado de
 * alta. Se responde siempre igual ante credenciales incorrectas.
 */

export interface AuthState {
  error?: string
}

const credentials = z.object({
  email: z.string().email('Introduce un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
})

const registration = credentials.extend({
  displayName: z.string().trim().min(1, 'Dinos cómo te llamas.').max(60),
})

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: 'Correo o contraseña incorrectos.' }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registration.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Lo recoge el trigger `handle_new_user` para rellenar el perfil.
      data: { display_name: parsed.data.displayName },
    },
  })

  if (error) {
    return {
      error:
        error.message.toLowerCase().includes('already')
          ? 'Ese correo ya está registrado.'
          : 'No hemos podido crear la cuenta. Inténtalo de nuevo.',
    }
  }

  track('registered')

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

/* --- Recuperar la contraseña ---------------------------------------------- */

export interface RecoverState {
  error?: string
  sent?: boolean
}

/**
 * Manda el enlace para poner una contraseña nueva.
 *
 * Responde **siempre lo mismo**, exista el correo o no. Decir "ese correo no
 * está registrado" convierte este formulario en una forma cómoda de averiguar
 * quién tiene cuenta, y es justo lo que se evita en el resto del archivo.
 *
 * El envío lo limita Supabase por su cuenta (hay un tope de correos por
 * dirección y por rato), así que no se añade otro limitador aquí.
 */
export async function requestPasswordReset(
  _prev: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const parsed = z
    .object({ email: z.string().email('Introduce un correo válido.') })
    .safeParse({ email: formData.get('email') })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa el correo.' }
  }

  const supabase = await createClient()
  const origin = await requestOrigin()

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/recuperar/nueva`,
  })

  return { sent: true }
}

export interface NewPasswordState {
  error?: string
}

/**
 * Guarda la contraseña nueva.
 *
 * Solo funciona con la sesión que abre el enlace del correo: sin ella,
 * `updateUser` no tiene a quién cambiarle nada y Supabase lo rechaza.
 */
export async function updatePassword(
  _prev: NewPasswordState,
  formData: FormData,
): Promise<NewPasswordState> {
  const parsed = z
    .object({
      password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
      repeat: z.string(),
    })
    .refine((v) => v.password === v.repeat, {
      message: 'Las dos contraseñas no coinciden.',
      path: ['repeat'],
    })
    .safeParse({
      password: formData.get('password'),
      repeat: formData.get('repeat'),
    })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'El enlace ha caducado. Pide uno nuevo.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: 'No hemos podido cambiarla. Prueba con otra o pide un enlace nuevo.' }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
