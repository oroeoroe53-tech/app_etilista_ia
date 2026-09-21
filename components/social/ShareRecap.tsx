'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

/**
 * Compartir el resumen del mes.
 *
 * El diseño pedía «Compartir en Stories», «TikTok» y «Guardar vídeo». No hay
 * vídeo, y fabricar uno en el navegador para una función que se usa una vez al
 * mes sería muchísimo trabajo para un resultado peor que el texto.
 *
 * Así que se comparte texto por el selector del sistema, que es el que lleva a
 * Stories, a TikTok o a donde sea. Sin foto y sin nombre: lo que sale es un
 * número tuyo, no una pieza de publicidad con tu cara.
 */
export function ShareRecap({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text })
        return
      } catch {
        return
      }
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button size="lg" fullWidth variant="secondary" onClick={share}>
      {copied ? 'Copiado' : 'Compartir mi mes'}
    </Button>
  )
}
