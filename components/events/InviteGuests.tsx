'use client'

import { useState, useTransition } from 'react'
import { eventInviteUrl } from '@/app/(app)/eventos/actions'
import { Button } from '@/components/ui'

/**
 * Repartir el enlace del evento.
 *
 * A diferencia de la invitación al círculo, este enlace **no es de un solo
 * uso**: se manda al grupo de la boda entero y se apunta quien quiera. Aquí eso
 * no abre nada de nadie —apuntarse solo deja ver qué se pone la gente de ese
 * evento— y exigir un enlace por invitada convertiría organizar una cena de
 * ocho en ocho gestos.
 */
export function InviteGuests({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function share() {
    startTransition(async () => {
      const link = url ?? (await eventInviteUrl(eventId))
      if (!link) return
      setUrl(link)

      const text = 'Apúntate y dime qué te pones, que no vayamos iguales'

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ text, url: link })
          return
        } catch {
          return
        }
      }

      try {
        await navigator.clipboard.writeText(`${text}: ${link}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {
        setCopied(false)
      }
    })
  }

  return (
    <div>
      <Button size="lg" fullWidth variant="secondary" onClick={share} disabled={pending}>
        {pending ? 'Un momento…' : 'Invitar al grupo'}
      </Button>
      {url ? (
        <p className="mono mt-3 truncate text-center text-ink-faint">
          {copied ? 'enlace copiado' : url.replace(/^https?:\/\//, '')}
        </p>
      ) : null}
    </div>
  )
}
