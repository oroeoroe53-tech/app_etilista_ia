'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage, validateUpload } from '@/lib/storage/compress'
import { BUCKETS } from '@/lib/storage/paths'
import { createItem } from '@/app/(app)/armario/actions'
import { ItemForm, EMPTY_ITEM, type ItemFormValues } from './ItemForm'
import { Button, Notice } from '@/components/ui'

/**
 * Alta manual de una prenda.
 *
 * La foto es opcional y el análisis por IA es un atajo, no un peaje: se puede
 * rellenar todo a mano sin gastar una llamada. Y si el análisis falla, el
 * formulario sigue ahí con los valores por defecto (PLAN.md §35).
 */
export function NewItemFlow() {
  const inputRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<string | null>(null)
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [values, setValues] = useState<ItemFormValues>(EMPTY_ITEM)
  const [formKey, setFormKey] = useState(0)
  const [busy, setBusy] = useState<'upload' | 'analyze' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [analyzed, setAnalyzed] = useState(false)

  async function onPick(file: File) {
    setError(null)

    const check = validateUpload(file)
    if (!check.ok) {
      setError(check.error)
      return
    }

    setBusy('upload')
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Se ha cerrado la sesión. Vuelve a entrar.')
        return
      }

      const compressed = await compressImage(file)
      // Nombre provisional: la prenda todavía no existe, así que no hay id.
      const path = `${user.id}/nueva-${Date.now()}.jpg`

      const { error: upErr } = await supabase.storage
        .from(BUCKETS.clothing)
        .upload(path, compressed.blob, { contentType: 'image/jpeg', upsert: true })

      if (upErr) {
        setError('No hemos podido subir la foto.')
        return
      }

      setImagePath(path)
      setPreview(URL.createObjectURL(compressed.blob))
    } finally {
      setBusy(null)
    }
  }

  async function analyze() {
    if (!imagePath) return
    setBusy('analyze')
    setError(null)

    try {
      const res = await fetch('/api/wardrobe/analyze-item', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: imagePath }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No hemos podido analizar la foto.')
        return
      }

      const g = data.garment
      setValues({
        category: g.category,
        subcategory: g.subcategory ?? null,
        primary_color: g.primary_color,
        secondary_colors: g.secondary_colors ?? [],
        pattern: g.pattern,
        fit: g.fit,
        material: g.material,
        styles: g.styles ?? [],
        seasons: g.seasons?.length ? g.seasons : EMPTY_ITEM.seasons,
        formality: g.formality,
        warmth: g.warmth,
        condition: 'good',
        is_available: true,
        notes: null,
      })
      // Vuelve a montar el formulario para que los `defaultValue` cojan lo nuevo.
      setFormKey((k) => k + 1)
      setAnalyzed(true)
    } catch {
      setError('No hemos podido analizar la foto. Rellena los datos a mano.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />

      {preview ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            className="aspect-3/4 w-full rounded-[var(--radius-card)] border border-line object-cover"
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              Cambiar foto
            </Button>
            {!analyzed ? (
              <Button
                size="sm"
                className="flex-1"
                disabled={busy !== null}
                onClick={analyze}
              >
                {busy === 'analyze' ? 'Mirando…' : 'Rellenar por mí'}
              </Button>
            ) : null}
          </div>
          {analyzed ? (
            <Notice>He rellenado lo que he podido ver. Corrige lo que no cuadre.</Notice>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="flex h-40 w-full flex-col items-center justify-center gap-2
                     rounded-[var(--radius-card)] border border-dashed border-line
                     text-sm text-ink-soft"
        >
          <span className="text-2xl text-ink-faint">+</span>
          {busy === 'upload' ? 'Subiendo…' : 'Hacer o elegir una foto'}
          <span className="text-xs text-ink-faint">Opcional</span>
        </button>
      )}

      {error ? <Notice tone="error">{error}</Notice> : null}

      <ItemForm
        key={formKey}
        action={createItem}
        values={values}
        submitLabel="Añadir al armario"
        imagePath={imagePath}
      />
    </div>
  )
}
