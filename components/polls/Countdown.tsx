'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

/**
 * La cuenta atrás.
 *
 * Es la pieza que hace que esto funcione. Sin un número bajando, «¿cuál me
 * pongo?» es una pregunta más en un grupo y se contesta cuando alguien la ve;
 * con él, se contesta ahora. Todo lo demás de esta función es logística.
 *
 * Detalles que importan:
 *
 *  · **La hora la pone el servidor, la cuenta la lleva el navegador.** Se
 *    recibe el instante de cierre en ISO y cada quien resta contra su propio
 *    reloj. Mandar «quedan 14 minutos» calculado en el servidor se desfasaría
 *    en cuanto la página llevara un rato abierta.
 *  · **El reloj es una fuente externa, no un estado.** Por eso se lee con
 *    `useSyncExternalStore` y no con `useState` dentro de un efecto: el tiempo
 *    no lo produce React, y tratarlo como estado propio es lo que provoca
 *    renders en cascada (y lo que el linter prohíbe, con razón).
 *  · **Se refresca sola al llegar a cero**, una vez. Quien esté mirando ve el
 *    resultado aparecer sin tocar nada, que es justo cuando quiere verlo.
 *  · **Por debajo de dos minutos se pone en arcilla.** Es el único color de
 *    alarma que tiene esta aplicación y se gasta aquí.
 */

/** Un único latido por segundo, compartido por todas las cuentas de la pantalla. */
function subscribe(onChange: () => void): () => void {
  const id = setInterval(onChange, 1000)
  return () => clearInterval(id)
}

/** Segundos enteros: así dos cuentas atrás de la misma pantalla van a la vez. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * En el servidor no hay reloj que valga.
 *
 * Devolver aquí la hora real garantizaría un HTML con un número que el
 * navegador contradice medio segundo después. Devolviendo 0 se reserva el
 * hueco y el primer número que se ve ya es el bueno.
 */
function serverSeconds(): number {
  return 0
}

function format(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `${hours} h ${minutes % 60} min`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function Countdown({
  closesAt,
  className,
  onZeroRefresh = true,
}: {
  closesAt: string
  className?: string
  /** Refrescar la pantalla al cerrarse. Se apaga en las filas de resumen. */
  onZeroRefresh?: boolean
}) {
  const router = useRouter()
  const tick = useSyncExternalStore(subscribe, nowSeconds, serverSeconds)

  const left = tick === 0 ? null : Math.max(0, new Date(closesAt).getTime() - tick * 1000)
  const finished = left === 0

  // Una sola vez: `refresh()` vuelve a montar esto y sin el cerrojo se llamaría
  // en bucle mientras la cuenta siga en cero.
  const refreshed = useRef(false)

  useEffect(() => {
    if (!finished || !onZeroRefresh || refreshed.current) return
    refreshed.current = true
    router.refresh()
  }, [finished, onZeroRefresh, router])

  if (left === null) {
    // Reserva el sitio para que nada salte cuando llegue el número.
    return <span className={cn('mono tabular-nums opacity-0', className)}>0:00</span>
  }

  if (finished) {
    return <span className={cn('mono tabular-nums text-ink-faint', className)}>cerrada</span>
  }

  const urgent = left < 2 * 60_000

  return (
    <span
      // Se anuncia solo cuando se pregunta: un lector de pantalla leyendo cada
      // segundo sería insoportable.
      aria-live="off"
      className={cn('mono tabular-nums', urgent ? 'text-clay' : 'text-ink-soft', className)}
    >
      {format(left)}
    </span>
  )
}
