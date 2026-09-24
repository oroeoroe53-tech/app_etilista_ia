'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createEvent, type EventFormState } from '@/app/(app)/eventos/actions'
import { Button, Notice, TextInput } from '@/components/ui'

/**
 * Crear un evento.
 *
 * Tres campos y dos son obligatorios. La tentación era pedir hora, código de
 * vestimenta y descripción; nada de eso cambia lo que alguien se pone ni ayuda
 * a que dos personas no vayan iguales, y cada campo de más es una razón para
 * dejarlo a medias.
 */
export function EventForm() {
  const [state, formAction] = useActionState<EventFormState, FormData>(createEvent, {})

  // Por defecto, el sábado que viene: la fecha más probable de lo que se
  // organiza desde aquí.
  const saturday = nextSaturday()

  return (
    <form action={formAction}>
      <p className="eyebrow mb-3">Qué es</p>
      <TextInput
        name="title"
        required
        maxLength={80}
        placeholder="Boda de Lucía"
        autoComplete="off"
      />

      <p className="eyebrow mt-7 mb-3">Cuándo</p>
      <TextInput name="heldOn" type="date" required defaultValue={saturday} />

      <p className="eyebrow mt-7 mb-3">Dónde (opcional)</p>
      <TextInput name="place" maxLength={80} placeholder="Toledo" autoComplete="off" />

      {state.error ? (
        <div className="mt-6">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      <div className="mt-8">
        <Submit />
      </div>

      <p className="mt-3 text-center text-micro leading-[1.5] text-ink-faint">
        Después te damos el enlace para invitar. Todo se borra solo una semana
        después del evento, fotos incluidas.
      </p>
    </form>
  )
}

function nextSaturday(): string {
  const date = new Date()
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7))
  return date.toISOString().slice(0, 10)
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Creando…' : 'Crear el evento'}
    </Button>
  )
}
