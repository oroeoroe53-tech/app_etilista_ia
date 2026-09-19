'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { requestOutfits, saveLocation, type RequestState } from '@/app/(app)/outfits/actions'
import { Button, Notice, Field, TextInput } from '@/components/ui'
import { OCCASION_LABELS, FORMALITY_LABELS } from '@/lib/wardrobe/labels'
import { OCCASIONS } from '@/lib/wardrobe/taxonomy'
import { cn } from '@/lib/utils/cn'

interface RequestFormProps {
  weather: {
    temperatureC: number
    description: string
    rain: boolean
    city: string | null
  } | null
  hasLocation: boolean
}

/**
 * Formulario de "¿Qué me pongo?".
 *
 * Todo es opcional. Si la persona no dice nada y se limita a pulsar el botón,
 * tiene que salir algo razonable: preguntar cinco cosas antes de dar una
 * respuesta convierte un gesto en un trámite.
 */
export function RequestForm({ weather, hasLocation }: RequestFormProps) {
  const [state, formAction] = useActionState<RequestState, FormData>(requestOutfits, {})

  const [occasion, setOccasion] = useState<string>('')
  const [formality, setFormality] = useState<number | null>(null)
  const [manualTemp, setManualTemp] = useState<number>(weather?.temperatureC ?? 18)
  const [manualRain, setManualRain] = useState(false)
  const [editingWeather, setEditingWeather] = useState(!weather)

  const useAuto = Boolean(weather) && !editingWeather

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="occasion" value={occasion} />
      <input type="hidden" name="formality" value={formality ?? ''} />
      <input type="hidden" name="useAutoWeather" value={String(useAuto)} />
      {!useAuto ? (
        <>
          <input type="hidden" name="temperatureC" value={manualTemp} />
          <input type="hidden" name="rain" value={String(manualRain)} />
        </>
      ) : null}

      <section>
        <p className="eyebrow mb-3">Para qué</p>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {OCCASIONS.map((value) => (
            <Pill
              key={value}
              active={occasion === value}
              onClick={() => setOccasion(occasion === value ? '' : value)}
            >
              {OCCASION_LABELS[value]}
            </Pill>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-3">El tiempo</p>

        {useAuto && weather ? (
          <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-raised px-5 py-4">
            <div>
              <p className="display text-2xl">{weather.temperatureC}°</p>
              <p className="text-sm text-ink-soft">
                {weather.description}
                {weather.city ? ` · ${weather.city}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingWeather(true)}
              className="text-sm text-ink-soft underline underline-offset-4"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="space-y-4 rounded-[var(--radius-card)] border border-line bg-raised p-5">
            {!hasLocation ? <LocationSetup /> : null}

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">Temperatura</span>
                <span className="display text-2xl">{manualTemp}°</span>
              </div>
              <input
                type="range"
                min={-5}
                max={42}
                value={manualTemp}
                onChange={(e) => setManualTemp(Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
                aria-label="Temperatura en grados"
              />
            </div>

            <label className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Está lloviendo</span>
              <input
                type="checkbox"
                checked={manualRain}
                onChange={(e) => setManualRain(e.target.checked)}
                className="h-5 w-5 accent-[var(--accent)]"
              />
            </label>

            {weather ? (
              <button
                type="button"
                onClick={() => setEditingWeather(false)}
                className="text-sm text-ink-soft underline underline-offset-4"
              >
                Usar el tiempo real ({weather.temperatureC}°)
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow mb-3">Cómo de arreglada</p>
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

      <Submit />

      <p className="text-center text-xs text-ink-faint">
        Todo es opcional. Si no me dices nada, me apaño.
      </p>
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Pensando…' : 'Dime qué me pongo'}
    </Button>
  )
}

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors',
        active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-raised text-ink-soft',
      )}
    >
      {children}
    </button>
  )
}

/** Alta de ubicación para poder consultar el tiempo sin preguntar cada vez. */
function LocationSetup() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!query.trim()) return
    setBusy(true)
    setStatus(null)
    const result = await saveLocation(query)
    setStatus(result.ok ? `Guardado: ${result.place.name}` : result.error)
    setBusy(false)
  }

  return (
    <div className="border-b border-line pb-4">
      <Field label="Tu ciudad" hint="Para no tener que preguntarte el tiempo cada vez">
        <div className="flex gap-2">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Madrid, Valencia…"
            className="flex-1"
          />
          <Button type="button" variant="secondary" size="md" disabled={busy} onClick={save}>
            {busy ? '…' : 'Guardar'}
          </Button>
        </div>
      </Field>
      {status ? <p className="mt-2 text-xs text-ink-soft">{status}</p> : null}
    </div>
  )
}
