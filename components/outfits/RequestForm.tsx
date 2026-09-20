'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { requestOutfits, saveLocation, type RequestState } from '@/app/(app)/outfits/actions'
import { Button, Notice, Chip } from '@/components/ui'
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
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="occasion" value={occasion} />
      <input type="hidden" name="formality" value={formality ?? ''} />
      <input type="hidden" name="useAutoWeather" value={String(useAuto)} />
      {!useAuto ? (
        <>
          <input type="hidden" name="temperatureC" value={manualTemp} />
          <input type="hidden" name="rain" value={String(manualRain)} />
        </>
      ) : null}

      {/* --- Para qué ---------------------------------------------------- */}
      <section>
        <p className="eyebrow mb-3">Para qué</p>
        <div className="flex flex-wrap gap-[6px]">
          {OCCASIONS.map((value) => (
            <Chip
              key={value}
              selected={occasion === value}
              onClick={() => setOccasion(occasion === value ? '' : value)}
            >
              {OCCASION_LABELS[value]}
            </Chip>
          ))}
        </div>
      </section>

      {/* --- El tiempo ---------------------------------------------------- */}
      <section>
        <p className="eyebrow mb-3">El tiempo</p>

        {useAuto && weather ? (
          <div className="flex items-center justify-between rounded-[22px] bg-raised p-4 shadow-card-soft">
            <div>
              <p className="display text-[20px]">{Math.round(weather.temperatureC)}°</p>
              <p className="mt-0.5 text-[11.5px] text-ink-soft">
                {weather.description.toLowerCase()}
                {weather.city ? ` · ${weather.city}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingWeather(true)}
              className="text-[11.5px] text-ink-soft underline underline-offset-4"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="space-y-4 rounded-[22px] bg-raised p-4 shadow-card-soft">
            {!hasLocation ? <LocationSetup /> : null}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12px] text-ink-soft">Temperatura</span>
                <span className="display text-[20px]">{manualTemp}°</span>
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

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-ink-soft">Está lloviendo</span>
              <Toggle
                checked={manualRain}
                onChange={setManualRain}
                label="Está lloviendo"
              />
            </div>

            {weather ? (
              <button
                type="button"
                onClick={() => setEditingWeather(false)}
                className="text-[11.5px] text-ink-soft underline underline-offset-4"
              >
                Usar el tiempo real ({Math.round(weather.temperatureC)}°)
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* --- Cómo de arreglada -------------------------------------------- */}
      <section>
        <p className="eyebrow mb-3">Cómo de arreglada</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setFormality(formality === n ? null : n)}
              aria-pressed={formality === n}
              aria-label={FORMALITY_LABELS[n]}
              className={cn(
                'display flex-1 rounded-[14px] border py-2.5 text-[17px] transition-colors',
                formality === n
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line text-ink-soft',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10.5px] text-ink-faint">
          <span>{FORMALITY_LABELS[1]}</span>
          <span>{FORMALITY_LABELS[5]}</span>
        </div>
      </section>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Submit />
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

/**
 * Interruptor.
 *
 * Es un `button` con `role="switch"` y no una casilla disfrazada: aquí no hay
 * formulario que enviar sin JavaScript —el valor viaja en un campo oculto— y
 * un botón con el rol correcto lo anuncia bien el lector de pantalla sin tener
 * que esconder nada.
 */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[26px] w-11 shrink-0 rounded-full border transition-colors',
        checked ? 'border-accent bg-accent' : 'border-line bg-transparent',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-[2px] h-5 w-5 rounded-full transition-[left] duration-[180ms] ease-out',
          checked ? 'left-[20px] bg-accent-ink' : 'left-[2px] bg-ink-faint',
        )}
      />
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
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Madrid, Valencia…"
          aria-label="Tu ciudad"
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-ink-soft"
        />
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={save}>
          {busy ? '…' : 'Guardar'}
        </Button>
      </div>
      <p className="mt-2 text-[10.5px] text-ink-faint">
        {status ?? 'Para no tener que preguntarte el tiempo cada vez.'}
      </p>
    </div>
  )
}
