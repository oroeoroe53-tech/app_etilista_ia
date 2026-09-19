'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { requestAccountDeletion, type DeleteState } from '@/app/(app)/perfil/actions'
import { Button, Field, TextInput } from '@/components/ui'

/**
 * Borrado de cuenta.
 *
 * Se explica qué desaparece antes de pedir confirmación. Que alguien sepa
 * exactamente qué está borrando forma parte de poder borrarlo.
 */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<DeleteState, FormData>(
    requestAccountDeletion,
    {},
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-center text-sm text-danger underline underline-offset-4"
      >
        Eliminar mi cuenta
      </button>
    )
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-danger/30 p-5">
      <p className="eyebrow mb-3">Eliminar cuenta</p>

      <p className="mb-3 text-sm leading-relaxed text-ink-soft">
        Se borrará todo y no hay vuelta atrás:
      </p>

      <ul className="mb-5 space-y-1.5 text-sm text-ink-soft">
        <Item>Tus fotos, las originales y los recortes</Item>
        <Item>Tu armario entero</Item>
        <Item>Tu perfil de estilo y tus preferencias</Item>
        <Item>Tu historial y todo lo que has valorado</Item>
      </ul>

      <form action={formAction} className="space-y-4">
        <Field label="Escribe tu correo para confirmar" error={state.error}>
          <TextInput
            name="confirmEmail"
            type="email"
            autoComplete="off"
            placeholder={email}
            required
          />
        </Field>

        <div className="flex gap-2">
          <Cancel onCancel={() => setOpen(false)} />
          <Submit />
        </div>
      </form>
    </div>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
      {children}
    </li>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="danger" className="flex-1" disabled={pending}>
      {pending ? 'Eliminando…' : 'Eliminar para siempre'}
    </Button>
  )
}

function Cancel({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="button"
      variant="secondary"
      className="flex-1"
      disabled={pending}
      onClick={onCancel}
    >
      Cancelar
    </Button>
  )
}
