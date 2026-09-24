'use client'

import { useState, useTransition } from 'react'
import { createInvite } from '@/app/(app)/circulo/actions'
import { Button, Notice } from '@/components/ui'

/**
 * Invitar a alguien.
 *
 * Cada pulsación crea una invitación nueva, de un solo uso, y abre el selector
 * del sistema para mandarla. Es deliberadamente un gesto por persona: no hay un
 * enlace permanente que se pueda reenviar a un grupo entero.
 *
 * Mientras se comparte se enseña el enlace en pantalla. Si el selector del
 * sistema no existe o se cancela, ese texto es la salida: se puede copiar a
 * mano y la invitación no se pierde.
 */
export function InviteButton() {
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function invite() {
    setError(null)
    startTransition(async () => {
      const result = await createInvite()

      if ('error' in result) {
        setError(result.error)
        return
      }

      setUrl(result.url)
      const text = 'Te invito a mi círculo en Estilista'

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ text, url: result.url })
          return
        } catch {
          // Cancelar no es un error: el enlace se queda en pantalla.
          return
        }
      }

      try {
        await navigator.clipboard.writeText(`${text}: ${result.url}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {
        setCopied(false)
      }
    })
  }

  return (
    <div>
      <Button size="lg" fullWidth onClick={invite} disabled={pending}>
        {pending ? 'Creando…' : 'Invitar a alguien'}
      </Button>

      {url ? (
        <p className="mono mt-3 truncate text-center text-ink-faint">
          {copied ? 'enlace copiado' : url.replace(/^https?:\/\//, '')}
        </p>
      ) : (
        <p className="mt-3 text-center text-micro leading-[1.5] text-ink-faint">
          Cada invitación vale para una persona y caduca en una semana.
        </p>
      )}

      {error ? (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </div>
  )
}
