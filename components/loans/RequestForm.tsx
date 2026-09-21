'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { requestLoan, type LoanState } from '@/app/(app)/prestamos/actions'
import { Button, Notice, TextInput } from '@/components/ui'

/**
 * Pedir una prenda prestada.
 *
 * El recado opcional es lo que convierte esto en un favor y no en una
 * notificación: «para la boda del sábado» se contesta que sí; una petición seca
 * se queda sin contestar y luego hay que preguntarlo por WhatsApp igual.
 *
 * Al enviarse, la pantalla no navega a ningún sitio. Quien pide se queda donde
 * estaba, viendo que ya está pedido, porque la respuesta no llega ahora: llega
 * cuando la otra persona abra la aplicación.
 */
export function RequestForm({
  itemId,
  ownerId,
  ownerName,
}: {
  itemId: string
  ownerId: string
  ownerName: string
}) {
  const [state, formAction] = useActionState<LoanState, FormData>(requestLoan, {})

  if (state.ok) {
    return (
      <div>
        <Notice>
          Pedida. {ownerName} la verá al entrar y te contestará desde aquí.
        </Notice>
        <Link href="/prestamos" className="mt-4 block">
          <Button variant="secondary" size="lg" fullWidth type="button">
            Ver mis préstamos
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="ownerId" value={ownerId} />

      <TextInput
        name="message"
        maxLength={140}
        placeholder="para la boda del sábado"
        autoComplete="off"
      />

      {state.error ? (
        <div className="mt-4">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      <div className="mt-4">
        <Submit name={ownerName} />
      </div>
    </form>
  )
}

function Submit({ name }: { name: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Pidiendo…' : `Pedírsela a ${name}`}
    </Button>
  )
}
