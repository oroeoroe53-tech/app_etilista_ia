'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Notice } from '@/components/ui'
import type { AuthState } from './actions'

interface AuthFormProps {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>
  submitLabel: string
  withName?: boolean
}

export function AuthForm({ action, submitLabel, withName }: AuthFormProps) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-4">
      {withName ? (
        <Field
          name="displayName"
          label="Cómo te llamas"
          type="text"
          autoComplete="given-name"
          required
        />
      ) : null}

      <Field name="email" label="Correo" type="email" autoComplete="email" required />

      <Field
        name="password"
        label="Contraseña"
        type="password"
        autoComplete={withName ? 'new-password' : 'current-password'}
        minLength={8}
        required
      />

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Submit label={submitLabel} />
    </form>
  )
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Un momento…' : label}
    </Button>
  )
}

function Field({
  name,
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string }) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      <input
        name={name}
        className="h-12 w-full rounded-2xl border border-line bg-raised px-4 text-base
                   text-ink outline-none focus:border-ink-soft"
        {...props}
      />
    </label>
  )
}
