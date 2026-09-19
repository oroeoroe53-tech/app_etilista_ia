'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markWorn } from '@/app/(app)/outfits/actions'
import { Button } from '@/components/ui'

export interface OutfitView {
  id: string
  explanation: string | null
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
    <article className="border-b border-line pb-8 last:border-0">
      <p className="eyebrow mb-4">Look {index + 1}</p>

      <ul className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5">
        {outfit.items.map((item) => (
          <li key={item.id} className="w-28 shrink-0">
            <Link href={`/armario/${item.id}`}>
              {item.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  className="aspect-3/4 w-full rounded-2xl border border-line object-cover"
                />
              ) : (
                <div className="flex aspect-3/4 w-full items-center justify-center rounded-2xl border border-line bg-sunken px-2 text-center text-[10px] leading-tight text-ink-faint">
                  {item.name}
                </div>
              )}
              <p className="mt-1.5 truncate text-[11px] text-ink-soft">{item.name}</p>
            </Link>
          </li>
        ))}
      </ul>

      {outfit.explanation ? (
        <p className="mb-4 text-[15px] leading-relaxed text-ink-soft">{outfit.explanation}</p>
      ) : null}

      {worn ? (
        <p className="text-sm text-ink-faint">Apuntado. Lo tendré en cuenta.</p>
      ) : (
        <Button variant="secondary" size="sm" disabled={isPending} onClick={onWear}>
          {isPending ? 'Apuntando…' : 'Me lo pongo'}
        </Button>
      )}
    </article>
  )
}
