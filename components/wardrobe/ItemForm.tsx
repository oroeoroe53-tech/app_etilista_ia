'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Select, TextInput, TextArea, ChipGroup, ScaleInput, Notice } from '@/components/ui'
import type { ItemFormState } from '@/app/(app)/armario/actions'
import { EMPTY_REFERENCE, type GarmentReference } from '@/lib/wardrobe/reference'
import {
  CATEGORY_LIST, COLORS, FITS, MATERIALS, PATTERNS, SEASONS, STYLES,
} from '@/lib/wardrobe/taxonomy'
import {
  CATEGORY_LABELS, COLOR_LABELS, FIT_LABELS, MATERIAL_LABELS, PATTERN_LABELS,
  SEASON_LABELS, STYLE_LABELS, FORMALITY_LABELS, WARMTH_LABELS, CONDITION_LABELS,
  colorLabel, categoryLabel,
} from '@/lib/wardrobe/labels'

export interface ItemFormValues extends GarmentReference {
  category: string
  subcategory: string | null
  primary_color: string
  secondary_colors: string[]
  pattern: string
  fit: string
  material: string
  styles: string[]
  seasons: string[]
  formality: number
  warmth: number
  condition: string
  is_available: boolean
  notes: string | null
}

export const EMPTY_ITEM: ItemFormValues = {
  ...EMPTY_REFERENCE,
  category: 'tshirt',
  subcategory: null,
  primary_color: 'black',
  secondary_colors: [],
  pattern: 'solid',
  fit: 'regular',
  material: 'unknown',
  styles: [],
  seasons: ['spring', 'autumn'],
  formality: 3,
  warmth: 3,
  condition: 'good',
  is_available: true,
  notes: null,
}

/** Las categorías se agrupan por capa: una lista plana de 33 no se navega bien en móvil. */
const CATEGORY_OPTIONS = CATEGORY_LIST.map((c) => ({
  value: c,
  label: categoryLabel(c),
})).sort((a, b) => a.label.localeCompare(b.label, 'es'))

const COLOR_OPTIONS = COLORS.map((c) => ({ value: c, label: colorLabel(c) })).sort((a, b) =>
  a.label.localeCompare(b.label, 'es'),
)

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const PATTERN_OPTIONS = PATTERNS.map((p) => ({
  value: p,
  label: p === 'other' ? 'Otro' : capitalize(PATTERN_LABELS[p].ms || p),
}))

const FIT_OPTIONS = FITS.map((f) => ({
  value: f,
  label:
    f === 'regular' ? 'Normal' : f === 'unknown' ? 'Sin determinar' : capitalize(FIT_LABELS[f].ms),
}))

const MATERIAL_OPTIONS = MATERIALS.map((m) => ({ value: m, label: MATERIAL_LABELS[m] }))

const SEASON_OPTIONS = SEASONS.map((s) => ({ value: s, label: SEASON_LABELS[s] }))
const STYLE_OPTIONS = STYLES.map((s) => ({ value: s, label: STYLE_LABELS[s] }))

const CONDITION_OPTIONS = ['new', 'good', 'worn', 'retired'].map((c) => ({
  value: c,
  label: CONDITION_LABELS[c] ?? c,
}))

interface ItemFormProps {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>
  values: ItemFormValues
  submitLabel: string
  /** Ruta de la imagen ya subida, si la hay. Viaja oculta con el formulario. */
  imagePath?: string | null
}

/**
 * Formulario de prenda, compartido entre crear y editar.
 *
 * La IA se equivoca, y el usuario tiene que poder corregirla siempre
 * (PLAN.md §15). Guardar aquí marca la prenda como verificada: es la señal de
 * que alguien la ha mirado.
 */
export function ItemForm({ action, values, submitLabel, imagePath }: ItemFormProps) {
  const [state, formAction] = useActionState<ItemFormState, FormData>(action, {})
  const errors = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-5">
      {imagePath ? <input type="hidden" name="image_path" value={imagePath} /> : null}

      {/*
        "Lo que he deducido".
        Cada línea es una afirmación que se puede tocar para corregir, no un
        campo vacío que hay que rellenar. La diferencia importa: la primera
        versión dice "esto es lo que he visto, dime si me equivoco"; la segunda
        te pone a trabajar.
      */}
      <div className="rounded-[22px] bg-raised p-4 shadow-card-soft">
        <p className="eyebrow mb-1">Lo que he deducido</p>

        <Row label="Categoría" error={errors.category}>
          <Select bare name="category" defaultValue={values.category} options={CATEGORY_OPTIONS} />
        </Row>

        <Row label="Color" error={errors.primary_color}>
          <Select bare name="primary_color" defaultValue={values.primary_color} options={COLOR_OPTIONS} />
        </Row>

        <Row label="Estampado" error={errors.pattern}>
          <Select bare name="pattern" defaultValue={values.pattern} options={PATTERN_OPTIONS} />
        </Row>

        <Row label="Corte" error={errors.fit}>
          <Select bare name="fit" defaultValue={values.fit} options={FIT_OPTIONS} />
        </Row>

        <Row label="Tejido" error={errors.material}>
          <Select bare name="material" defaultValue={values.material} options={MATERIAL_OPTIONS} />
        </Row>

        <Row label="Estado" error={errors.condition}>
          <Select bare name="condition" defaultValue={values.condition} options={CONDITION_OPTIONS} />
        </Row>

        <Row label="Detalle">
          <TextInput
            bare
            name="subcategory"
            defaultValue={values.subcategory ?? ''}
            maxLength={60}
            placeholder="Oxford, de lino…"
          />
        </Row>

        <p className="pt-3.5 text-micro leading-[1.4] text-ink-faint">
          Toca cualquier línea para corregirme. Aprendo de las correcciones.
        </p>
      </div>

      {/* Lo que admite varios valores no cabe en una línea: va suelto debajo. */}
      <Block label="Temporadas" hint="Cuándo te la pones" error={errors.seasons}>
        <ChipGroup name="seasons" options={SEASON_OPTIONS} selected={values.seasons} />
      </Block>

      <Block label="Estilo" hint="Hasta cuatro" error={errors.styles}>
        <ChipGroup name="styles" options={STYLE_OPTIONS} selected={values.styles} />
      </Block>

      <Block label="Cómo de arreglada es" error={errors.formality}>
        <ScaleInput name="formality" value={values.formality} labels={FORMALITY_LABELS} />
      </Block>

      <Block label="Cuánto abriga" error={errors.warmth}>
        <ScaleInput name="warmth" value={values.warmth} labels={WARMTH_LABELS} />
      </Block>

      {/*
        "De dónde es".

        Va en su propia tarjeta y no entre los rasgos porque no es lo mismo: los
        rasgos los dedujo una máquina de una foto, y esto lo sabe la etiqueta o
        la tienda. Se rellena entero a mano, y hasta que la IA sea de verdad esa
        es la única forma fiable: un código inventado manda a una amiga a nada.

        La referencia es el código, no la marca. Por eso el código va primero y
        con el formato de la tienda como pista: es lo que alguien pide cuando
        dice "pásame la referencia".
      */}
      <div className="rounded-[22px] bg-raised p-4 shadow-card-soft">
        <p className="eyebrow mb-1">De dónde es</p>

        <Row label="Marca" error={errors.brand}>
          <TextInput bare name="brand" defaultValue={values.brand ?? ''} maxLength={60}
            placeholder="Zara, Mango…" autoCapitalize="words" />
        </Row>

        <Row label="Referencia" error={errors.reference_code}>
          <TextInput bare name="reference_code" defaultValue={values.reference_code ?? ''}
            maxLength={60} placeholder="2731/604/800" autoCapitalize="characters"
            spellCheck={false} />
        </Row>

        <Row label="Nombre en la tienda" error={errors.product_name}>
          <TextInput bare name="product_name" defaultValue={values.product_name ?? ''}
            maxLength={120} placeholder="Falda midi plisada" />
        </Row>

        <Row label="Su color" error={errors.brand_color}>
          <TextInput bare name="brand_color" defaultValue={values.brand_color ?? ''}
            maxLength={40} placeholder="Arena" />
        </Row>

        <Row label="Talla" error={errors.size}>
          <TextInput bare name="size" defaultValue={values.size ?? ''} maxLength={20}
            placeholder="M" autoCapitalize="characters" />
        </Row>

        <Row label="Lo que pagaste" error={errors.price_cents}>
          <TextInput bare name="price" type="number" step="0.01" min="0" inputMode="decimal"
            defaultValue={values.price_cents !== null ? (values.price_cents / 100).toFixed(2) : ''}
            placeholder="29,95" />
        </Row>

        <Row label="Cuándo" error={errors.bought_at}>
          <TextInput bare name="bought_at" type="date" defaultValue={values.bought_at ?? ''} />
        </Row>

        <Row label="Enlace" error={errors.source_url}>
          <TextInput bare name="source_url" type="url" defaultValue={values.source_url ?? ''}
            maxLength={600} placeholder="El de la tienda" spellCheck={false}
            autoCapitalize="none" />
        </Row>

        <p className="pt-3.5 text-micro leading-[1.4] text-ink-faint">
          La referencia viene en la etiqueta. Es lo que te piden cuando te
          preguntan de dónde es algo.
        </p>
      </div>

      <Block label="Notas" hint="Opcional">
        <TextArea
          name="notes"
          defaultValue={values.notes ?? ''}
          maxLength={500}
          placeholder="Con qué la sueles combinar, si aprieta, si destiñe…"
        />
      </Block>

      <label className="flex items-center justify-between rounded-[18px] border border-line px-4 py-3">
        <span className="text-small text-ink-soft">La tengo disponible</span>
        <input
          type="checkbox"
          name="is_available"
          value="true"
          defaultChecked={values.is_available}
          className="h-5 w-5 accent-[var(--accent)]"
        />
        {/* Una casilla sin marcar no se envía: este campo garantiza el "false". */}
        <input type="hidden" name="is_available" value="false" />
      </label>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Submit label={submitLabel} />
    </form>
  )
}

/** Una línea de la tarjeta: etiqueta a la izquierda, valor a la derecha. */
function Row({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block border-b border-line py-3 last-of-type:border-b-0">
      <span className="flex items-center justify-between gap-4">
        <span className="shrink-0 text-small text-ink-soft">{label}</span>
        <span className="min-w-0 flex-1">{children}</span>
      </span>
      {error ? (
        <span role="alert" className="mt-1 block text-right text-micro text-danger">
          {error}
        </span>
      ) : null}
    </label>
  )
}

/** Campo de varios valores: la etiqueta va arriba porque el control ocupa ancho. */
function Block({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="eyebrow mb-2.5">{label}</p>
      {children}
      {hint && !error ? (
        <p className="mt-2 text-micro text-ink-faint">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-micro text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Guardando…' : label}
    </Button>
  )
}

export { COLOR_LABELS, CATEGORY_LABELS }
