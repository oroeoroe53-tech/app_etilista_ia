'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Notice } from '@/components/ui'

interface Status {
  total: number
  finished: boolean
  progress: number
  itemCount: number
  pendingReview: number
  counts: { pending: number; processing: number; done: number; failed: number; skipped: number }
  error: string | null
}

/**
 * Pantalla de espera del análisis.
 *
 * El trabajo pesado corre en el servidor; aquí solo se consulta el progreso cada
 * dos segundos. Si la petición que lo disparó muere (red del móvil, pestaña
 * cerrada), el estado sigue vivo en la base de datos y se puede reintentar.
 *
 * Los mensajes van rotando porque una barra parada treinta segundos parece
 * colgada aunque no lo esté.
 */
const MENSAJES = [
  'Mirando tus fotos…',
  'Identificando prendas…',
  'Buscando repeticiones entre looks…',
  'Anotando colores y cortes…',
  'Montando tu armario…',
]

export function AnalysisProgress({ initialTotal }: { initialTotal: number }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [mensaje, setMensaje] = useState(0)
  const [reintentando, setReintentando] = useState(false)
  const lanzado = useRef(false)

  // Dispara el análisis una sola vez, aunque React monte el componente dos
  // veces en desarrollo por el modo estricto.
  useEffect(() => {
    if (lanzado.current) return
    lanzado.current = true
    fetch('/api/onboarding/analyze', { method: 'POST' }).catch(() => {
      // El fallo se detecta igualmente por el estado de las fotos.
    })
  }, [])

  useEffect(() => {
    const id = setInterval(() => setMensaje((m) => (m + 1) % MENSAJES.length), 3500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelado = false

    async function consultar() {
      try {
        const res = await fetch('/api/onboarding/status', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as Status
        if (cancelado) return

        setStatus(data)

        if (data.finished) {
          clearInterval(id)
          // Un respiro para que se vea el 100% antes de cambiar de pantalla.
          setTimeout(() => {
            router.replace(data.pendingReview > 0 ? '/onboarding/revisar' : '/armario')
          }, 900)
        }
      } catch {
        // Un fallo puntual de red no debe romper la pantalla: se reintenta solo.
      }
    }

    const id = setInterval(consultar, 2000)
    consultar()

    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [router])

  async function reintentar() {
    setReintentando(true)
    await fetch('/api/onboarding/analyze', { method: 'POST' }).catch(() => {})
    setReintentando(false)
  }

  const fallado = (status?.counts.failed ?? 0) > 0 && status?.finished
  const progreso = status?.progress ?? 0
  const total = status?.total ?? initialTotal

  if (fallado) {
    return (
      <div className="space-y-5">
        <h1 className="display text-3xl">No hemos podido analizarlas</h1>
        <Notice tone="error">
          {status?.error ?? 'Algo ha fallado durante el análisis.'}
        </Notice>
        <p className="text-sm leading-relaxed text-ink-soft">
          Tus fotos siguen guardadas. Puedes volver a intentarlo sin subirlas otra vez.
        </p>
        <Button fullWidth size="lg" disabled={reintentando} onClick={reintentar}>
          {reintentando ? 'Reintentando…' : 'Reintentar'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow mb-4">Un momento</p>
        <h1 className="display text-4xl leading-tight">{MENSAJES[mensaje]}</h1>
      </div>

      <div>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={progreso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso del análisis"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(6, progreso)}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          {status?.counts.done ?? 0} de {total} {total === 1 ? 'foto' : 'fotos'}
          {status && status.itemCount > 0 ? ` · ${status.itemCount} prendas encontradas` : ''}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-ink-soft">
        Estoy mirando las fotos juntas para reconocer qué prendas se repiten. Puede
        tardar medio minuto.
      </p>
    </div>
  )
}
