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
  /*
   * Dos entradas de archivo, no una.
   *
   * `capture` le dice al teléfono que abra la cámara directamente en vez del
   * selector. Es la diferencia entre "hacer foto" y "elegir foto", y en una
   * aplicación de armario se usan las dos: una para la prenda que tienes en la
   * mano, otra para la que ya fotografiaste.
   */
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

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
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
      <input
        ref={galleryRef}
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
            className="garment-photo h-[230px] w-full rounded-[24px] object-cover"
          />
          <div className="flex gap-2.5">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={busy !== null}
              onClick={() => galleryRef.current?.click()}
            >
              Cambiar foto
            </Button>
            {!analyzed ? (
              <Button className="flex-1" disabled={busy !== null} onClick={analyze}>
                {busy === 'analyze' ? 'Mirando…' : 'Rellenar por mí'}
              </Button>
            ) : null}
          </div>
          {analyzed ? (
            <Notice>He rellenado lo que he podido ver. Corrige lo que no cuadre.</Notice>
          ) : null}
        </div>
      ) : (
        <div className="photo-slot relative flex h-[230px] w-full flex-col items-center justify-center gap-3 rounded-[24px]">
          <span className="mono absolute bottom-3 left-3.5 text-ink-faint">
            foto de la prenda
          </span>

          <div className="flex gap-2.5">
            <Button disabled={busy !== null} onClick={() => cameraRef.current?.click()}>
              {busy === 'upload' ? 'Subiendo…' : 'Hacer foto'}
            </Button>
            <Button
              variant="secondary"
              className="bg-[rgba(255,253,248,0.75)]"
              disabled={busy !== null}
              onClick={() => galleryRef.current?.click()}
            >
              Galería
            </Button>
          </div>
          <span className="text-[10.5px] text-ink-faint">Opcional</span>
        </div>
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
