'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { savePreferences, type PreferencesState } from '@/app/(app)/estilo/actions'
import { Button, Field, ChipGroup, Select, Notice } from '@/components/ui'
import { colorLabel, FORMALITY_LABELS } from '@/lib/wardrobe/labels'
import { COLORS } from '@/lib/wardrobe/taxonomy'

const COLOR_OPTIONS = COLORS.map((c) => ({ value: c, label: colorLabel(c) })).sort((a, b) =>
  a.label.localeCompare(b.label, 'es'),
)

const FORMALITY_OPTIONS = [
  { value: '', label: 'Depende del día' },
  ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: FORMALITY_LABELS[n]! })),
]

/**
 * Preferencias declaradas.
 *
 * Lo que la persona dice aquí pesa más que lo que el sistema deduzca: son dos
 * fuentes distintas y se guardan por separado a propósito.
 */
export function PreferencesForm({
  dislikedColors,
  defaultFormality,
}: {
  dislikedColors: string[]
  defaultFormality: number | null
}) {
  const [state, formAction] = useActionState<PreferencesState, FormData>(savePreferences, {})

  return (
    <form action={formAction} className="space-y-6">
      <Field label="Colores que no me pongo">
        <ChipGroup name="disliked_colors" options={COLOR_OPTIONS} selected={dislikedColors} />
      </Field>

      <Field
        label="Cómo sueles ir"
        hint="Lo usaré como punto de partida cuando no me digas la ocasión"
      >
        <Select
          name="default_formality"
          defaultValue={defaultFormality ? String(defaultFormality) : ''}
          options={FORMALITY_OPTIONS}
        />
      </Field>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? <Notice>Guardado.</Notice> : null}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="secondary" fullWidth disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  )
}
