'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendStyledLook, type StyleState } from '@/app/(app)/vestir/actions'
import { describeGarment } from '@/lib/wardrobe/labels'
import type { SharedItem } from '@/lib/wardrobe/shared'
import { Button, Notice, PhotoSlot, TextInput } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

/**
 * Montarle un look a otra persona.
 *
 * Es elegir prendas de un armario que no es el tuyo, así que la pantalla no se
 * parece a la del motor: **no hay puntuación, ni porcentaje, ni sugerencias**.
 * Quien monta esto es una persona que conoce a la otra, y decirle que su
 * elección tiene un 72 % de acierto sería ponerle una nota a un regalo.
 *
 * Lo que sí hace la pantalla es no dejarte mandar un imposible: lo que está
 * prestado ahora mismo no se puede elegir, porque no está en su casa.
 */
export function StyleComposer({
  ownerId,
  ownerName,
  items,
}: {
  ownerId: string
  ownerName: string
  items: SharedItem[]
}) {
  const [state, formAction] = useActionState<StyleState, FormData>(sendStyledLook, {})
  const [picked, setPicked] = useState<string[]>([])

  function toggle(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length >= 8 ? prev : [...prev, id],
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="ownerId" value={ownerId} />
      {picked.map((id) => (
        <input key={id} type="hidden" name="itemIds" value={id} />
      ))}

      <ul className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const label = describeGarment(item)
          const chosen = picked.includes(item.id)
          const order = picked.indexOf(item.id) + 1

          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.onLoan}
                aria-pressed={chosen}
                onClick={() => toggle(item.id)}
                className={cn(
                  'relative block w-full overflow-hidden rounded-2xl',
                  item.onLoan && 'opacity-35',
                )}
              >
                <PhotoSlot src={item.imageUrl} label={label} className="aspect-[3/4] w-full" />

                {chosen ? (
                  /* El número dice el orden: de arriba abajo, como se viste
                     una. Un tic solo diría «esta sí», que es menos. */
                  <span className="mono absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-micro text-accent-ink">
                    {order}
                  </span>
                ) : null}

                {item.onLoan ? (
                  <span className="mono absolute bottom-1.5 left-1.5 rounded-full bg-[rgba(21,20,15,.6)] px-1.5 py-0.5 text-micro text-[#f7f4ee]">
                    prestada
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-8">
        <p className="eyebrow mb-3">Dile algo</p>
        <TextInput
          name="note"
          maxLength={200}
          placeholder="para el viernes, con las botas marrones"
          autoComplete="off"
        />
      </div>

      {state.error ? (
        <div className="mt-5">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}

      <div className="mt-7">
        <Submit count={picked.length} name={ownerName} />
      </div>
    </form>
  )
}

function Submit({ count, name }: { count: number; name: string }) {
  const { pending } = useFormStatus()
  const enough = count >= 2

  return (
    <>
      <Button type="submit" size="lg" fullWidth disabled={!enough || pending}>
        {pending ? 'Mandando…' : `Mandárselo a ${name}`}
      </Button>
      <p className="mt-3 text-center text-micro text-ink-faint">
        {enough
          ? `${count} prendas · lo verá al entrar`
          : 'Elige al menos dos prendas.'}
      </p>
    </>
  )
}
