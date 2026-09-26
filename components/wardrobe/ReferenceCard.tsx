'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui'
import {
  formatPrice,
  referenceText,
  seasonLabel,
  storeHost,
  storeUrl,
  type GarmentReference,
} from '@/lib/wardrobe/reference'

/**
 * "De dónde es".
 *
 * Una tarjeta y no una fila de lista: esto no es un dato de inventario, es parte
 * de la identidad de la prenda, y es lo segundo que pregunta cualquiera después
 * de qué es.
 *
 * El botón de copiar es la razón de que exista la pantalla. Lo que se pide por
 * WhatsApp es un texto, no un enlace, y hasta ahora había que escribirlo a mano
 * mirando la etiqueta.
 */
export function ReferenceCard({
  reference,
  garmentName,
  editHref,
}: {
  reference: GarmentReference
  /** El nombre que le da la aplicación, para cuando no se sabe cómo lo llama la tienda. */
  garmentName: string
  /** Solo en tu propia prenda: en la de una amiga no hay nada que corregir. */
  editHref?: string
}) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'manual'>('idle')

  const texto = referenceText(reference, garmentName)
  const url = storeUrl(reference)
  const precio = formatPrice(reference.price_cents)
  const temporada = seasonLabel(reference.bought_at)

  async function copy() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopied('done')
      window.setTimeout(() => setCopied('idle'), 2200)
    } catch {
      // Safari lo bloquea si la pestaña no está en primer plano, y en http a
      // secas no existe. En vez de un error, se enseña el texto para copiarlo
      // a mano: la referencia es lo que importa, no el atajo.
      setCopied('manual')
    }
  }

  return (
    <section className="mt-6 rounded-[22px] bg-raised p-4 shadow-card-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">De dónde es</p>
        {editHref ? (
          <Link href={editHref} className="-mt-1 text-micro text-ink-faint underline">
            corregir
          </Link>
        ) : null}
      </div>

      {reference.brand ? (
        <p className="display mt-2 text-lead leading-none">{reference.brand}</p>
      ) : null}

      {reference.product_name ? (
        <p className="mt-1.5 text-small leading-[1.4] text-ink-soft">
          {reference.product_name}
        </p>
      ) : null}

      {reference.reference_code ? (
        <p className="mono mono-code mt-3 rounded-[12px] bg-sunken px-3 py-2.5 text-ink">
          {reference.reference_code}
        </p>
      ) : null}

      {reference.brand_color || reference.size ? (
        <ul className="mt-2.5 flex flex-wrap gap-[6px]">
          {reference.brand_color ? (
            <li className="rounded-full border border-line px-3 py-[7px] text-small text-ink-soft">
              color {reference.brand_color}
            </li>
          ) : null}
          {reference.size ? (
            <li className="rounded-full border border-line px-3 py-[7px] text-small text-ink-soft">
              talla {reference.size}
            </li>
          ) : null}
        </ul>
      ) : null}

      {precio || temporada ? (
        <p className="mt-2.5 text-micro text-ink-faint">
          {[precio, temporada].filter(Boolean).join(' · ')}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        {/* El de copiar se estira y el de la tienda ocupa lo suyo. Con los dos a
            `flex-1` a 375px, "Copiar referencia" partia en dos lineas y la
            capsula crecia hasta desencajar la fila. */}
        <Button className="flex-1 whitespace-nowrap" onClick={copy}>
          {copied === 'done' ? 'Copiada' : 'Copiar referencia'}
        </Button>

        {/* El enlace es un enlace de verdad y no un boton con `onClick`: asi se
            puede abrir en otra pestaña, y se lee como enlace. Lleva las clases
            del secundario a mano porque `Button` es un `<button>`. */}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="press lift-paper sheen sheen-paper inline-flex h-[46px] shrink-0 items-center justify-center rounded-full border border-line px-4 text-small font-medium tracking-[0.03em] whitespace-nowrap text-ink"
          >
            {storeHost(url)}
          </a>
        ) : null}
      </div>

      {copied === 'manual' ? (
        <div className="mt-3">
          <p className="mb-1.5 text-micro text-ink-faint">
            Tu navegador no me deja copiarlo. Selecciónalo tú:
          </p>
          <pre className="mono mono-code rounded-[12px] bg-sunken p-3 whitespace-pre-wrap text-ink select-all">
            {texto}
          </pre>
        </div>
      ) : null}
    </section>
  )
}
