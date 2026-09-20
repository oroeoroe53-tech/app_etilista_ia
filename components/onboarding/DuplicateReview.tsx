'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resolveDuplicate, finishOnboarding } from '@/app/onboarding/actions'
import { Button } from '@/components/ui'

export interface DuplicateQuestion {
  detectionId: string
  /** Prenda recién detectada. */
  candidate: { label: string; imageUrl: string | null }
  /** Prenda del armario con la que podría coincidir. */
  existing: { label: string; imageUrl: string | null }
  similarity: number
}

/**
 * "¿Es esta la misma camiseta?"
 *
 * Solo aparece cuando el sistema no lo tiene claro (PLAN.md §13). Las decisiones
 * evidentes ya se resolvieron solas: preguntar por todo sería trasladarle al
 * usuario un trabajo que es nuestro.
 *
 * Se puede saltar. Las dudas quedan guardadas y no bloquean el armario.
 */
export function DuplicateReview({ questions }: { questions: DuplicateQuestion[] }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [isPending, startTransition] = useTransition()

  const current = questions[index]
  const remaining = questions.length - index

  function answer(same: boolean) {
    if (!current) return
    const detectionId = current.detectionId

    startTransition(async () => {
      await resolveDuplicate(detectionId, same)
      if (index + 1 >= questions.length) {
        await finishOnboarding()
        router.replace('/armario')
      } else {
        setIndex((i) => i + 1)
      }
    })
  }

  function skip() {
    startTransition(async () => {
      await finishOnboarding()
      router.replace('/armario')
    })
  }

  if (!current) return null

  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow mb-3">
          {remaining} {remaining === 1 ? 'duda' : 'dudas'}
        </p>
        <h1 className="display text-[30px] leading-[1.05]">¿Es la misma prenda?</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          La he visto en varias fotos y no estoy seguro de si es una sola prenda o dos
          parecidas.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <GarmentCard label={current.existing.label} imageUrl={current.existing.imageUrl} caption="Ya en tu armario" />
        <GarmentCard label={current.candidate.label} imageUrl={current.candidate.imageUrl} caption="Detectada ahora" />
      </div>

      <div className="space-y-3">
        <Button size="lg" fullWidth disabled={isPending} onClick={() => answer(true)}>
          Sí, es la misma
        </Button>
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          disabled={isPending}
          onClick={() => answer(false)}
        >
          No, son distintas
        </Button>
      </div>

      <button
        type="button"
        onClick={skip}
        disabled={isPending}
        className="block w-full text-center text-sm text-ink-soft underline underline-offset-4"
      >
        Decidirlo más tarde
      </button>
    </div>
  )
}

function GarmentCard({
  label,
  imageUrl,
  caption,
}: {
  label: string
  imageUrl: string | null
  caption: string
}) {
  return (
    <figure className="space-y-2">
      {imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl}
          alt={label}
          className="garment-photo aspect-3/4 w-full rounded-2xl border border-line object-cover"
        />
      ) : (
        <div className="flex aspect-3/4 w-full items-center justify-center rounded-2xl border border-line bg-sunken text-xs text-ink-faint">
          sin foto
        </div>
      )}
      <figcaption>
        <span className="eyebrow block">{caption}</span>
        <span className="text-sm text-ink">{label}</span>
      </figcaption>
    </figure>
  )
}
