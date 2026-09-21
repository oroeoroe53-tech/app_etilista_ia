'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { compressImage, validateUpload } from '@/lib/storage/compress'
import { BUCKETS, pollPhotoPath } from '@/lib/storage/paths'
import { createPoll, type PollFormState } from '@/app/(app)/votacion/actions'
import { Button, Chip, Notice, TextInput } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

/**
 * Montar una votación.
 *
 * Toda la pantalla está diseñada para un caso concreto: alguien de pie delante
 * del espejo, con prisa, con dos perchas en la mano. De ahí las decisiones:
 *
 *  · **Las fotos se suben mientras se eligen las demás.** Esperar a darle a
 *    «preguntar» para empezar a subir cuatro fotos son quince segundos mirando
 *    una barra, y quince segundos con prisa es demasiado.
 *  · **La cuenta atrás viene puesta en veinte minutos.** Es lo más parecido a
 *    lo que la gente va a querer, y una decisión menos.
 *  · **La pregunta es opcional y está la última.** Escribir con prisa es lo
 *    primero que se abandona.
 *  · **Con dos fotos ya se puede preguntar.** Dos es el caso real; cuatro es el
 *    máximo porque a partir de ahí nadie elige, todo el mundo opina.
 */

const MAX_OPTIONS = 4

/** Las duraciones que de verdad se usan. «1 h» es para quedar luego. */
const DURATIONS = [
  { minutes: 10, label: '10 min' },
  { minutes: 20, label: '20 min' },
  { minutes: 60, label: '1 hora' },
  { minutes: 180, label: '3 horas' },
]

interface Slot {
  /** Vista previa local: se ve antes de que termine la subida. */
  preview: string
  /** Ruta en Storage. `null` mientras sube. */
  path: string | null
  failed?: boolean
}

export function PollComposer() {
  const [state, formAction] = useActionState<PollFormState, FormData>(createPoll, {})

  const [slots, setSlots] = useState<Slot[]>([])
  const [minutes, setMinutes] = useState(20)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const ready = slots.filter((s) => s.path).length
  const uploading = slots.some((s) => !s.path && !s.failed)

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    setUploadError(null)

    const room = MAX_OPTIONS - slots.length
    const chosen = [...files].slice(0, Math.max(0, room))

    for (const file of chosen) {
      const check = validateUpload(file)
      if (!check.ok) {
        setUploadError(check.error)
        continue
      }
      void upload(file)
    }
  }

  async function upload(file: File) {
    const preview = URL.createObjectURL(file)
    // Sitio en la rejilla desde el primer momento: la foto aparece ya, y la
    // subida ocurre debajo sin que se note.
    setSlots((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, { preview, path: null }]))

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('sin sesión')

      const compressed = await compressImage(file)
      const path = pollPhotoPath(user.id, 'image/jpeg')

      const { error } = await supabase.storage
        .from(BUCKETS.pollPhotos)
        .upload(path, compressed.blob, { contentType: 'image/jpeg' })

      if (error) throw error

      setSlots((prev) => prev.map((s) => (s.preview === preview ? { ...s, path } : s)))
    } catch {
      setSlots((prev) => prev.map((s) => (s.preview === preview ? { ...s, failed: true } : s)))
      setUploadError('Una foto no ha subido. Quítala y vuelve a intentarlo.')
    }
  }

  function remove(preview: string) {
    setSlots((prev) => prev.filter((s) => s.preview !== preview))
    URL.revokeObjectURL(preview)
  }

  return (
    <form action={formAction}>
      {/* --- Las opciones --------------------------------------------------- */}
      <p className="eyebrow mb-3">Las opciones · de 2 a 4</p>

      <div className="grid grid-cols-2 gap-2.5">
        {slots.map((slot, index) => (
          <figure
            key={slot.preview}
            className="relative aspect-[3/4] overflow-hidden rounded-[var(--radius-card)] bg-sunken"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slot.preview}
              alt={`Opción ${index + 1}`}
              className="h-full w-full object-cover"
            />

            {/* La subida se ve, pero no tapa la foto ni bloquea nada. */}
            {!slot.path && !slot.failed ? (
              <span className="mono absolute bottom-2 left-2.5 rounded-full bg-[rgba(21,20,15,.6)] px-2 py-1 text-[9px] text-[#f7f4ee]">
                subiendo
              </span>
            ) : null}

            {slot.failed ? (
              <span className="mono absolute bottom-2 left-2.5 rounded-full bg-danger px-2 py-1 text-[9px] text-[#f7f4ee]">
                no ha subido
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => remove(slot.preview)}
              aria-label={`Quitar la opción ${index + 1}`}
              className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(21,20,15,.55)] text-[13px] text-[#f7f4ee]"
            >
              ✕
            </button>

            <input type="hidden" name="paths" value={slot.path ?? ''} disabled={!slot.path} />
          </figure>
        ))}

        {slots.length < MAX_OPTIONS ? (
          <div className="grid aspect-[3/4] grid-rows-2 gap-2.5">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="photo-slot flex flex-col items-center justify-center rounded-[var(--radius-card)] text-[11.5px] text-ink-soft"
            >
              <span className="display text-[19px]">Hacer foto</span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-line text-[11.5px] text-ink-soft"
            >
              Elegir de la galería
            </button>
          </div>
        ) : null}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {/* --- Cuánto tiempo -------------------------------------------------- */}
      <p className="eyebrow mt-8 mb-3">Me voy en</p>
      <div className="bleed-row flex gap-2">
        {DURATIONS.map((duration) => (
          <Chip
            key={duration.minutes}
            selected={minutes === duration.minutes}
            onClick={() => setMinutes(duration.minutes)}
          >
            {duration.label}
          </Chip>
        ))}
      </div>
      <input type="hidden" name="minutes" value={minutes} />
      <p className="mt-2.5 text-[10.5px] leading-[1.5] text-ink-faint">
        Pasado ese rato la votación se cierra sola y ya no entran más votos. Las
        fotos se borran del todo a las 24 horas.
      </p>

      {/* --- La pregunta ---------------------------------------------------- */}
      <div className="mt-8">
        <p className="eyebrow mb-3">Para qué (opcional)</p>
        <TextInput
          name="question"
          maxLength={120}
          placeholder="cena con los de la oficina"
          autoComplete="off"
        />
      </div>

      {uploadError ? (
        <div className="mt-5">
          <Notice tone="error">{uploadError}</Notice>
        </div>
      ) : null}
      {state.error ? (
        <div className="mt-5">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      <div className="mt-8">
        <Submit ready={ready} uploading={uploading} />
      </div>
    </form>
  )
}

function Submit({ ready, uploading }: { ready: number; uploading: boolean }) {
  const { pending } = useFormStatus()
  const enough = ready >= 2

  return (
    <>
      <Button type="submit" size="lg" fullWidth disabled={!enough || uploading || pending}>
        {pending ? 'Creando…' : 'Pedir opinión'}
      </Button>
      <p className={cn('mt-3 text-center text-[10.5px]', enough ? 'text-ink-faint' : 'text-ink-soft')}>
        {uploading
          ? 'Esperando a que suban las fotos…'
          : enough
            ? 'Después te damos el enlace para mandarlo al grupo.'
            : 'Añade al menos dos opciones.'}
      </p>
    </>
  )
}
