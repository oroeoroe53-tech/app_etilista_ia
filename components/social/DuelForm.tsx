'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createDuel, type DuelState } from '@/app/(app)/social/duelo/actions'
import { Button, Chip, Notice } from '@/components/ui'

/**
 * Retar a alguien.
 *
 * Dos decisiones: a quién y para qué. El resto lo pone el motor.
 *
 * Solo aparece gente de tu círculo, y lo que se compone aquí es **tu** look:
 * el suyo no existe hasta que acepte. Ver `app/(app)/social/duelo/actions.ts`.
 */

const OCCASIONS = [
  { value: 'casual', label: 'Brunch de domingo' },
  { value: 'work', label: 'Lunes de oficina' },
  { value: 'date', label: 'Una cita' },
  { value: 'party', label: 'Salir de noche' },
  { value: 'formal_event', label: 'Un evento' },
  { value: 'travel', label: 'Un viaje' },
]

export function DuelForm({ friends }: { friends: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<DuelState, FormData>(createDuel, {})
  const [opponent, setOpponent] = useState<string | null>(friends[0]?.id ?? null)
  const [occasion, setOccasion] = useState('casual')

  if (friends.length === 0) {
    return (
      <Notice>
        Para retar a alguien hace falta que esté en tu círculo. Invita a una
        amiga desde Mis amigas.
      </Notice>
    )
  }

  return (
    <form action={formAction}>
      <p className="eyebrow mb-3">A quién retas</p>
      <div className="bleed-row flex gap-2">
        {friends.map((friend) => (
          <Chip
            key={friend.id}
            selected={opponent === friend.id}
            onClick={() => setOpponent(friend.id)}
          >
            {friend.name}
          </Chip>
        ))}
      </div>
      <input type="hidden" name="opponentId" value={opponent ?? ''} />

      <p className="eyebrow mt-8 mb-3">Para qué</p>
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

      {state.error ? (
        <div className="mt-7">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      <div className="mt-8">
        <Submit />
        <p className="mt-3 text-center text-[10.5px] leading-[1.5] text-ink-faint">
          Su look no se compone hasta que acepte. Vuestro círculo vota sin saber
          cuál es de quién.
        </p>
      </div>
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Montando tu look…' : 'Retar'}
    </Button>
  )
}
