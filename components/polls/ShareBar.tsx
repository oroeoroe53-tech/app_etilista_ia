'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

/**
 * Mandar el enlace al grupo.
 *
 * Esta es la acción que decide si la función existe o no: una votación que no
 * sale de la aplicación no la ve nadie. Por eso es un botón grande y sólido, y
 * no un icono de compartir en una esquina.
 *
 * `navigator.share` abre el selector del sistema —WhatsApp, mensajes, lo que
 * tenga— que es donde están los grupos. Cuando no existe (escritorio, casi
 * siempre), se copia al portapapeles y se dice que se ha copiado; un botón que
 * no hace nada visible parece roto.
 *
 * El texto que acompaña al enlace lo escribimos nosotros y menciona el rato que
 * queda, porque el mensaje que llega al grupo es el anuncio de esta aplicación
 * y es lo único de ella que verán quienes todavía no la tienen.
 */
export function ShareBar({ url, minutesLeft }: { url: string; minutesLeft: number }) {
  const [copied, setCopied] = useState(false)

  const text =
    minutesLeft > 0
      ? `¿Cuál me pongo? Dime en ${minutesLeft} min 👀`
      : '¿Cuál me pongo? Dime 👀'

  async function share() {
    // El tipo de `navigator.share` no está en todas las plataformas.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, url })
        return
      } catch {
        // Cancelar el selector del sistema no es un error: no se hace nada.
        return
      }
    }

    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div>
      <Button size="lg" fullWidth onClick={share}>
        Mandar al grupo
      </Button>
      <p className="mono mt-3 truncate text-center text-ink-faint">
        {copied ? 'enlace copiado' : url.replace(/^https?:\/\//, '')}
      </p>
    </div>
  )
}
