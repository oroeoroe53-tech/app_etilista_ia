'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { deleteItem, toggleAvailability } from '@/app/(app)/armario/actions'
import { Button, Notice } from '@/components/ui'

/**
 * Acciones sobre una prenda.
 *
 * El borrado pide confirmación en dos pasos y dice el nombre de la prenda: en
 * una cuadrícula de miniaturas parecidas es fácil entrar en la ficha equivocada.
 */
export function ItemActions({
  itemId,
  available,
  name,
}: {
  itemId: string
  available: boolean
  name: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  /*
   * Respuesta inmediata.
   *
   * Guardar una prenda es un interruptor: la persona ya sabe lo que va a pasar
   * y esperar medio segundo a que conteste el servidor hace que la aplicación
   * parezca lenta en algo que no lo es.
   *
   * Se cambia al instante y, si el servidor falla, se deshace y se avisa. Es la
   * parte que se suele olvidar y la que convierte el truco en una mentira.
   */
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const shown = optimistic ?? available

  function onToggle() {
    const next = !shown
    setOptimistic(next)
    setError(null)

    startTransition(async () => {
      const result = await toggleAvailability(itemId, next)
      if (!result?.ok) {
        setOptimistic(null)
        setError('No hemos podido guardar el cambio.')
      }
    })
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteItem(itemId)
      if (result && !result.ok) setError(result.error)
    })
  }

  return (
    <div className="space-y-3">
      <Link href={`/armario/${itemId}/editar`} className="block">
        <Button fullWidth size="lg">
          Corregir datos
        </Button>
      </Link>

      <Button variant="secondary" fullWidth onClick={onToggle}>
        {shown ? 'Guardar por ahora' : 'Volver a tenerla disponible'}
      </Button>

      <p className="px-2 text-xs leading-relaxed text-ink-faint">
        {shown
          ? 'Guardarla la deja fuera de las propuestas sin borrarla. Útil si está en la lavadora o prestada.'
          : 'Ahora mismo no la uso para proponerte looks.'}
      </p>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="pt-6">
        {confirming ? (
          <div className="space-y-3 rounded-[var(--radius-card)] border border-danger/30 p-4">
            <p className="text-sm leading-relaxed">
              ¿Seguro que quieres borrar <strong>{name}</strong>? Dejará de aparecer en tu
              armario y en las propuestas.
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                disabled={isPending}
                onClick={onDelete}
              >
                {isPending ? 'Borrando…' : 'Sí, borrar'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                disabled={isPending}
                onClick={() => setConfirming(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full text-center text-sm text-danger underline underline-offset-4"
          >
            Borrar prenda
          </button>
        )}
      </div>
    </div>
  )
}
