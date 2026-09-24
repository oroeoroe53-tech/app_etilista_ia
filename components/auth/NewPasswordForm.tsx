'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updatePassword, type NewPasswordState } from '@/app/(auth)/actions'
import { Button, Notice } from '@/components/ui'

/** Poner la contraseña nueva. Solo llega aquí quien abrió el enlace del correo. */
export function NewPasswordForm() {
  const [state, formAction] = useActionState<NewPasswordState, FormData>(
    updatePassword,
    {},
  )

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="eyebrow mb-2 block">Contraseña nueva</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-12 w-full rounded-2xl border border-line bg-raised px-4 text-base text-ink outline-none focus:border-ink-soft"
        />
      </label>

      <label className="block">
        <span className="eyebrow mb-2 block">Repítela</span>
        <input
          name="repeat"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-12 w-full rounded-2xl border border-line bg-raised px-4 text-base text-ink outline-none focus:border-ink-soft"
        />
      </label>

      <p className="text-micro leading-[1.5] text-ink-faint">
        Ocho caracteres como mínimo. Al guardarla entras directamente.
      </p>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar y entrar'}
    </Button>
  )
}
