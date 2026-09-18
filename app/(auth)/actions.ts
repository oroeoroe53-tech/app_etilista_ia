'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

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

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
