'use client'

import { useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { compressImage, validateUpload } from '@/lib/storage/compress'
import { BUCKETS, eventPhotoPath } from '@/lib/storage/paths'
import { setMyOutfit } from '@/app/(app)/eventos/actions'
import { COLORS } from '@/lib/wardrobe/taxonomy'
import { colorLabel } from '@/lib/wardrobe/labels'
import { COLOR_SWATCHES } from '@/lib/style/describe'
import { Button, Notice, TextInput } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

/**
 * De qué vas.
 *
 * Tres cosas, y cada una vale por sí sola:
 *
 *  · **El color.** Es el único dato que la aplicación entiende, y por tanto el
 *    único con el que puede avisar de que dos personas van igual. Si solo se
 *    rellena esto, la función ya sirve.
 *  · **Una frase**: «el vestido verde largo». Para quien no quiere subir foto.
 *  · **Una foto**, opcional. Se borra con el evento, una semana después.
 *
 * Ninguna es obligatoria porque exigir la foto dejaría media lista vacía, y una
 * lista a medias no evita que nadie vaya igual.
 */
export function OutfitDeclare({
  eventId,
  note,
  color,
  photoUrl,
}: {
  eventId: string
  note: string | null
  color: string | null
  photoUrl: string | null
}) {
  const [picked, setPicked] = useState<string | null>(color)
  const [preview, setPreview] = useState<string | null>(photoUrl)
  const [path, setPath] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  async function onPick(file: File) {
    setError(null)

    const check = validateUpload(file)
    if (!check.ok) {
      setError(check.error)
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('sin sesión')

      const compressed = await compressImage(file)
      const next = eventPhotoPath(user.id, 'image/jpeg')

      const { error: upErr } = await supabase.storage
        .from(BUCKETS.eventPhotos)
        .upload(next, compressed.blob, { contentType: 'image/jpeg' })

      if (upErr) throw upErr

      setPath(next)
      setPreview(URL.createObjectURL(compressed.blob))
    } catch {
      setError('No hemos podido subir la foto. El resto sí se guarda.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form action={setMyOutfit}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="color" value={picked ?? ''} />
      <input type="hidden" name="photoPath" value={path} />

      <p className="eyebrow mb-3">De qué color vas</p>
      <div className="bleed-row flex gap-2">
        {COLORS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={picked === value}
            onClick={() => setPicked(picked === value ? null : value)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border py-[7px] pr-3.5 pl-2 text-small transition-colors',
              picked === value
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-[color-mix(in_srgb,var(--ink)_16%,transparent)] text-ink-soft',
            )}
          >
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-full border border-[rgba(21,20,15,.12)]"
              style={{ background: COLOR_SWATCHES[value] }}
            />
            {colorLabel(value)}
          </button>
        ))}
      </div>

      <p className="eyebrow mt-7 mb-3">O dilo con palabras</p>
      <TextInput
        name="note"
        defaultValue={note ?? ''}
        maxLength={120}
        placeholder="el vestido verde largo"
        autoComplete="off"
      />

      <p className="eyebrow mt-7 mb-3">Y una foto, si quieres</p>
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            'h-[86px] w-[68px] shrink-0 overflow-hidden rounded-2xl',
            !preview && 'photo-slot',
          )}
        >
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="Tu look" className="h-full w-full object-cover" />
          ) : null}
        </button>
        <p className="text-small leading-[1.5] text-ink-soft">
          {uploading
            ? 'Subiendo…'
            : preview
              ? 'Toca la foto para cambiarla.'
              : 'Solo la ven las demás invitadas, y se borra con el evento.'}
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onPick(file)
          e.target.value = ''
        }}
      />

      {error ? (
        <div className="mt-5">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-7">
        <Submit disabled={uploading} />
      </div>
    </form>
  )
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={disabled || pending}>
      {pending ? 'Guardando…' : 'Guardar lo que me pongo'}
    </Button>
  )
}
