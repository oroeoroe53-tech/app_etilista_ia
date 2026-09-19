'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { planTrip, type PackingState } from '@/app/(app)/outfits/maleta/actions'
import { Button, Notice, Field, TextInput } from '@/components/ui'
import { FORMALITY_LABELS } from '@/lib/wardrobe/labels'
import { cn } from '@/lib/utils/cn'

/**
 * Planificar un viaje.
 *
 * Dos datos y ya: adónde y cuántos días. El destino sirve para mirar el tiempo,
 * y si no se reconoce, el viaje se planifica igual con la temporada.
 */
export function TripForm() {
  const [state, formAction] = useActionState<PackingState, FormData>(planTrip, {})
  const [days, setDays] = useState(4)
  const [formality, setFormality] = useState<number | null>(null)

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="days" value={days} />
      <input type="hidden" name="formality" value={formality ?? ''} />

      <Field label="Adónde vas" hint="Para mirar el tiempo. Opcional.">
        <TextInput name="destination" placeholder="Lisboa, Berlín, Cádiz…" maxLength={80} />
      </Field>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <p className="eyebrow">Cuántos días</p>
          <span className="display text-2xl">{days}</span>
        </div>
        <input
          type="range"
          min={1}
          max={14}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
          aria-label="Número de días"
        />
        <div className="mt-1 flex justify-between text-xs text-ink-faint">
          <span>1 día</span>
          <span>2 semanas</span>
        </div>
      </section>

      <section>
        <p className="eyebrow mb-3">Qué tipo de viaje</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setFormality(formality === n ? null : n)}
              aria-pressed={formality === n}
              className={cn(
                'flex-1 rounded-xl border py-2.5 text-sm transition-colors',
                formality === n
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line bg-raised text-ink-soft',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-ink-faint">
          <span>{FORMALITY_LABELS[1]}</span>
          <span>{FORMALITY_LABELS[5]}</span>
        </div>
      </section>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Submit days={days} />

      <p className="text-center text-xs leading-relaxed text-ink-faint">
        Buscaré repetir prendas entre días para que lleves la maleta más ligera.
      </p>
    </form>
  )
}

function Submit({ days }: { days: number }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Haciendo la maleta…' : `Prepárame ${days} ${days === 1 ? 'día' : 'días'}`}
    </Button>
  )
}
