'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markWorn } from '@/app/(app)/outfits/actions'
import { Button, PhotoSlot } from '@/components/ui'

export interface TodayLookView {
  outfitId: string
  title: string
  explanation: string | null
  match: number
  items: Array<{ id: string; name: string; imageUrl: string | null }>
}

/**
 * La tarjeta de la portada.
 *
 * Es lo primero que se ve al abrir la aplicación y lo único que tiene que
 * funcionar sin leer nada: tres fotos, un titular y dos botones.
 *
 * La rejilla enseña como mucho tres prendas aunque el look tenga cuatro o
 * cinco. No es una omisión: la cuenta real va escrita arriba ("4 prendas"), y
 * una cuadrícula de cinco huecos diminutos comunica menos que tres grandes.
 */
export function TodayLook({
  look,
  /*
   * En la demostración no hay sesión ni diario donde apuntar nada, así que el
   * botón principal deja de guardar y lleva a crear la cuenta. Se conserva la
   * etiqueta: quien lo pulsa acaba de decidir que se pondría ese look, y ese
   * es el momento exacto en el que merece la pena preguntarle si quiere el
   * suyo. Cambiar el texto a "Registrarse" convertiría una decisión sobre ropa
   * en un trámite.
   */
  href,
}: {
  look: TodayLookView
  href?: string
}) {
  const [worn, setWorn] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  const shown = look.items.slice(0, 3)

  function onWear() {
    startTransition(async () => {
      const result = await markWorn(look.outfitId)
      if (result.ok) setWorn(true)
      else setError(true)
    })
  }

  return (
    <article className="mt-5 rounded-[var(--radius-card)] bg-raised p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="eyebrow">Look de hoy</p>
        <p className="text-[11px] whitespace-nowrap text-ink-faint">
          {look.items.length} {look.items.length === 1 ? 'prenda' : 'prendas'}
          {look.match > 0 ? ` · ${look.match}%` : ''}
        </p>
      </div>

      {/*
        La primera prenda ocupa las dos filas. En un look la pieza que lo define
        casi siempre es la de arriba, y el motor la devuelve primero.
      */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: '1.3fr 1fr', gridTemplateRows: '96px 96px' }}
      >
        {shown.map((item, index) => (
          <Link
            key={item.id}
            href={`/armario/${item.id}`}
            className="min-h-0"
            style={index === 0 ? { gridRow: 'span 2' } : undefined}
          >
            <PhotoSlot
              src={item.imageUrl}
              label={item.name}
              className="h-full w-full rounded-2xl"
            />
          </Link>
        ))}
      </div>

      <h2 className="display mt-3.5 text-[20px] leading-[1.2]">{look.title}</h2>

      {look.explanation ? (
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink-soft">{look.explanation}</p>
      ) : null}

      {/*
        Una vez guardado, la fila deja de ser dos botones y pasa a ser uno solo
        a todo lo ancho.

        No es capricho de maqueta: "Guardado en tu diario" no cabe en media
        fila y parte en dos líneas. Y encaja con lo que ha pasado — ya has
        decidido qué te pones hoy, así que lo único que queda por hacer con
        esta tarjeta es ir a ver dónde ha quedado apuntado. Decir "guardado en
        tu diario" sin dejar llegar al diario sería contar dónde está algo y no
        abrir la puerta.
      */}
      {href ? (
        <div className="mt-4 flex gap-2.5">
          <Link href={href} className="flex-1">
            <Button fullWidth>Me lo pongo</Button>
          </Link>
          <Link href={href}>
            <Button variant="secondary" className="whitespace-nowrap">
              Otra idea
            </Button>
          </Link>
        </div>
      ) : worn ? (
        <Link href="/diario" className="mt-4 block">
          <Button variant="secondary" fullWidth>
            Guardado en tu diario →
          </Button>
        </Link>
      ) : (
        <div className="mt-4 flex gap-2.5">
          <Button className="flex-1" disabled={isPending} onClick={onWear}>
            {isPending ? 'Guardando…' : 'Me lo pongo'}
          </Button>
          <Link href="/outfits/que-me-pongo">
            <Button variant="secondary" className="whitespace-nowrap">
              Otra idea
            </Button>
          </Link>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2.5 text-[11px] text-danger">
          No he podido apuntarlo. Inténtalo otra vez.
        </p>
      ) : null}
    </article>
  )
}
