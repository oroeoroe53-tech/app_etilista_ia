'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markWorn } from '@/app/(app)/outfits/actions'
import { Button, PhotoSlot } from '@/components/ui'

export interface OutfitView {
  id: string
  title: string
  explanation: string | null
  /** 0–100. Cero cuando no se guardó puntuación: entonces no se enseña. */
  match: number
  items: Array<{
    id: string
    name: string
    imageUrl: string | null
  }>
}

/**
 * Un look propuesto.
 *
 * Las prendas se enseñan grandes y la explicación pequeña: el producto vende la
 * ropa, no lo que el sistema tenga que decir sobre ella (PLAN.md §42).
 *
 * Las fotos van en una fila de alto fijo y anchos iguales, no en una tira que
 * se desplaza. Un look es una unidad: si hay que arrastrar para ver la cuarta
 * prenda, deja de leerse como un conjunto.
 */
export function OutfitCard({ outfit, index }: { outfit: OutfitView; index: number }) {
  const [worn, setWorn] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onWear() {
    startTransition(async () => {
      const result = await markWorn(outfit.id)
      if (result.ok) setWorn(true)
    })
  }

  return (
    <article className="rounded-[24px] bg-raised p-4 shadow-card-soft">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="eyebrow">Look {index + 1}</p>
        {outfit.match > 0 ? (
          <p className="text-[11px] whitespace-nowrap text-ink-faint">{outfit.match}% match</p>
        ) : null}
      </div>

      <div className="flex gap-[7px]">
        {outfit.items.map((item) => (
          <Link key={item.id} href={`/armario/${item.id}`} className="min-w-0 flex-1">
            <PhotoSlot
              src={item.imageUrl}
              label={item.name}
              className="h-24 w-full rounded-[13px]"
            />
          </Link>
        ))}
      </div>

      <h2 className="display mt-3.5 text-[19px] leading-[1.2]">{outfit.title}</h2>

      {outfit.explanation ? (
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink-soft">{outfit.explanation}</p>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        <Button className="flex-1" disabled={worn || isPending} onClick={onWear}>
          {worn ? 'Guardado' : isPending ? 'Guardando…' : 'Me lo pongo'}
        </Button>
        {/*
          El diseño pone aquí "Cambiar pieza". Esa función no existe todavía —no
          hay forma de sustituir una prenda de un look ya propuesto— y un botón
          que no lleva a ninguna parte es peor que no tenerlo. Va en su lugar lo
          más cercano que sí sabe hacer la aplicación.
        */}
        <Link href="/outfits/que-me-pongo">
          <Button variant="secondary" className="whitespace-nowrap">
            Otra idea
          </Button>
        </Link>
      </div>
    </article>
  )
}
