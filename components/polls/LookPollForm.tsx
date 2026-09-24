'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { createPollFromLooks, type PollFormState } from '@/app/(app)/votacion/actions'
import { Button, Chip, Notice } from '@/components/ui'

/**
 * Pedir opinión sobre tres looks que monta el motor.
 *
 * Es la forma por defecto desde el rediseño. Lo que la hace buena no es la
 * pantalla, es lo que quita: antes había que ponerse las dos opciones y
 * fotografiarlas —vestirse dos veces para decidir cómo vestirse— y ahora solo
 * hay que decir para qué es y cuánto tiempo queda.
 *
 * Los looks no se enseñan aquí antes de preguntar, a propósito. Verlos primero
 * convertiría esto en «elige tú y que te lo confirmen», que es otra cosa y
 * además tarda más. Se ven en la votación, a la vez que quienes votan.
 */

const OCCASIONS = [
  { value: '', label: 'Sin más' },
  { value: 'work', label: 'Trabajo' },
  { value: 'casual', label: 'Diario' },
  { value: 'date', label: 'Cita' },
  { value: 'party', label: 'Fiesta' },
  { value: 'formal_event', label: 'Evento' },
  { value: 'travel', label: 'Viaje' },
]

const DURATIONS = [
  { minutes: 10, label: '10 min' },
  { minutes: 20, label: '20 min' },
  { minutes: 60, label: '1 hora' },
  { minutes: 180, label: '3 horas' },
]

export function LookPollForm() {
  const [state, formAction] = useActionState<PollFormState, FormData>(createPollFromLooks, {})
  const [occasion, setOccasion] = useState('')
  const [minutes, setMinutes] = useState(20)

  return (
    <form action={formAction}>
      <p className="eyebrow mb-3">Para qué</p>
      <div className="bleed-row flex gap-2">
        {OCCASIONS.map((item) => (
          <Chip
            key={item.value}
            selected={occasion === item.value}
            onClick={() => setOccasion(item.value)}
          >
            {item.label}
          </Chip>
        ))}
      </div>
      <input type="hidden" name="occasion" value={occasion} />

      <p className="eyebrow mt-8 mb-3">Me voy en</p>
      <div className="bleed-row flex gap-2">
        {DURATIONS.map((item) => (
          <Chip
            key={item.minutes}
            selected={minutes === item.minutes}
            onClick={() => setMinutes(item.minutes)}
          >
            {item.label}
          </Chip>
        ))}
      </div>
      <input type="hidden" name="minutes" value={minutes} />

      {state.error ? (
        <div className="mt-7">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      <div className="mt-8">
        <Submit />
        <p className="mt-3 text-center text-micro leading-[1.5] text-ink-faint">
          Se cierra sola al acabar la cuenta atrás. Nadie ve tu armario: solo
          estos tres looks.
        </p>
      </div>

      {/*
        La otra forma sigue existiendo, y sigue siendo la buena cuando lo que
        dudas lo tienes en la mano: dos vestidos en el probador, o algo que el
        armario todavía no sabe que existe.
      */}
      <div className="mt-9 border-t border-line pt-6 text-center">
        <Link
          href="/votacion/fotos"
          className="text-small text-ink-soft underline underline-offset-4"
        >
          Prefiero hacer fotos de lo que dudo
        </Link>
      </div>
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Montando los looks…' : 'Que monten tres y preguntar'}
    </Button>
  )
}
