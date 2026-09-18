'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { compressImage, validateUpload } from '@/lib/storage/compress'
import { BUCKETS, outfitPhotoPath } from '@/lib/storage/paths'
import { registerUploadedPhotos } from '@/app/onboarding/actions'
import { Button, Notice } from '@/components/ui'

interface Selected {
  id: string
  file: File
  preview: string
}

interface PhotoUploaderProps {
  min: number
  max: number
}

/**
 * Selección y subida de las fotos del onboarding.
 *
 * El archivo va del navegador a Storage directamente, sin pasar por el servidor
 * de Next: menos latencia, menos tiempo de función y menos tráfico.
 *
 * Antes de salir, cada foto se reduce a 1280 px en el propio navegador. Eso
 * ahorra datos móviles y, de paso, elimina el EXIF —que lleva la
 * geolocalización— sin tener que borrarlo a mano (PLAN.md §37).
 */
export function PhotoUploader({ min, max }: PhotoUploaderProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [selected, setSelected] = useState<Selected[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(0)
  const [isPending, startTransition] = useTransition()

  function addFiles(files: FileList | null) {
    if (!files) return
    setError(null)

    const room = max - selected.length
    const incoming = Array.from(files).slice(0, room)
    const accepted: Selected[] = []

    for (const file of incoming) {
      const check = validateUpload(file)
      if (!check.ok) {
        setError(check.error)
        continue
      }
      accepted.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
      })
    }

    if (Array.from(files).length > room) {
      setError(`Puedes subir ${max} fotos como máximo.`)
    }
    setSelected((prev) => [...prev, ...accepted])
  }

  function remove(id: string) {
    setSelected((prev) => {
      const target = prev.find((s) => s.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter((s) => s.id !== id)
    })
  }

  async function upload() {
    setUploading(true)
    setError(null)
    setDone(0)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError('Se ha cerrado la sesión. Vuelve a entrar.')
        return
      }

      const paths: string[] = []

      for (const item of selected) {
        const compressed = await compressImage(item.file)
        const path = outfitPhotoPath(user.id, compressed.mimeType)

        const { error: uploadError } = await supabase.storage
          .from(BUCKETS.outfitPhotos)
          .upload(path, compressed.blob, {
            contentType: compressed.mimeType,
            upsert: false,
          })

        if (uploadError) {
          setError(`No se ha podido subir una de las fotos: ${uploadError.message}`)
          return
        }

        paths.push(path)
        setDone((n) => n + 1)
      }

      const result = await registerUploadedPhotos(paths)
      if (!result.ok) {
        setError(result.error ?? 'No hemos podido registrar las fotos.')
        return
      }

      startTransition(() => router.push('/onboarding/analizando'))
    } catch (err) {
      console.error(err)
      setError('Algo ha fallado durante la subida. Inténtalo de nuevo.')
    } finally {
      setUploading(false)
    }
  }

  const enough = selected.length >= min
  const busy = uploading || isPending

  return (
    <div className="space-y-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {selected.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {selected.map((item) => (
            <li key={item.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.preview}
                alt=""
                className="aspect-3/4 w-full rounded-xl object-cover"
              />
              {!busy ? (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label="Quitar foto"
                  className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center
                             rounded-full bg-black/60 text-white backdrop-blur"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path
                      d="M1 1l10 10M11 1L1 11"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              ) : null}
            </li>
          ))}

          {selected.length < max && !busy ? (
            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-3/4 w-full items-center justify-center rounded-xl
                           border border-dashed border-line text-2xl text-ink-faint"
                aria-label="Añadir más fotos"
              >
                +
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-44 w-full flex-col items-center justify-center gap-2
                     rounded-[var(--radius-card)] border border-dashed border-line
                     text-sm text-ink-soft"
        >
          <span className="text-2xl text-ink-faint">+</span>
          Elegir fotos del carrete
        </button>
      )}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {busy ? (
        <Notice>
          Subiendo {done} de {selected.length}…
        </Notice>
      ) : (
        <p className="text-center text-xs text-ink-faint">
          {selected.length === 0
            ? `Necesito al menos ${min} fotos`
            : enough
              ? `${selected.length} ${selected.length === 1 ? 'foto' : 'fotos'} · listo`
              : `${selected.length} de ${min} mínimo`}
        </p>
      )}

      <Button size="lg" fullWidth disabled={!enough || busy} onClick={upload}>
        {busy ? 'Subiendo…' : 'Analizar mis looks'}
      </Button>
    </div>
  )
}
