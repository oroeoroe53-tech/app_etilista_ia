'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { requestPasswordReset, type RecoverState } from '@/app/(auth)/actions'
import { Button, Notice } from '@/components/ui'

/**
 * Pedir el enlace para volver a entrar.
 *
 * Cuando se manda, la respuesta es la misma haya cuenta o no. No es un
 * despiste: un "ese correo no existe" aquí sería una forma cómoda de averiguar
 * quién está registrado.
 */
export function RecoverForm() {
  const [state, formAction] = useActionState<RecoverState, FormData>(
    requestPasswordReset,
    {},
  )

  if (state.sent) {
    return (
      <div className="rounded-[22px] bg-raised p-5 shadow-card-soft">
        <p className="eyebrow mb-2">Enviado</p>
        <p className="display text-[20px]">Revisa tu correo</p>
        <p className="mt-2 text-[11.5px] leading-[1.5] text-ink-soft">
          Si esa dirección tiene cuenta, acaba de salir un enlace para poner una
          contraseña nueva. Caduca en una hora.
        </p>
        <p className="mt-3 text-[10.5px] leading-[1.5] text-ink-faint">
          Si no llega en unos minutos, mira en spam antes de volver a pedirlo.
        </p>
        <div className="mt-5">
          <Link href="/login" className="block">
            <Button variant="secondary" fullWidth>
              Volver a entrar
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="eyebrow mb-2 block">Tu correo</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-12 w-full rounded-2xl border border-line bg-raised px-4 text-base text-ink outline-none focus:border-ink-soft"
        />
      </label>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Enviando…' : 'Mándame el enlace'}
    </Button>
  )
}
