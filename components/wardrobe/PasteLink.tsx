'use client'

import { useRef, useState } from 'react'
import { Button, Notice, TextInput } from '@/components/ui'

/** Lo que devuelve la lectura, y los campos que rellena en el formulario. */
const CAMPOS = [
  'brand',
  'product_name',
  'reference_code',
  'brand_color',
] as const

interface LeidoDelEnlace {
  brand: string | null
  product_name: string | null
  reference_code: string | null
  brand_color: string | null
  price_cents: number | null
}

/**
 * Pegar el enlace de la tienda y que se rellene solo.
 *
 * **Por qué escribe en los campos a mano en vez de subir el estado.**
 *
 * El formulario de prenda es no controlado a propósito: `defaultValue` en cada
 * campo, y se vuelve a montar entero cuando cambian los valores. Convertirlo en
 * controlado para esto obligaría a tocar los veinte campos, y volver a montarlo
 * borraría lo que la persona estuviera escribiendo. Así que esto busca sus
 * hermanos dentro del mismo formulario por el atributo `name` y les pone el
 * valor, que es justo lo que haría el navegador al autocompletar.
 *
 * No pisa lo que ya esté escrito: si alguien puso la talla o corrigió la marca
 * antes de pegar el enlace, eso manda. La tienda rellena huecos.
 */
export function PasteLink() {
  const raiz = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leido, setLeido] = useState<string | null>(null)

  function campo(name: string): HTMLInputElement | null {
    const form = raiz.current?.closest('form')
    return form?.elements.namedItem(name) as HTMLInputElement | null
  }

  function rellenar(name: string, value: string) {
    const input = campo(name)
    if (!input || input.value.trim() !== '') return
    input.value = value
  }

  async function leer() {
    const limpio = url.trim()
    if (!limpio) return

    setBusy(true)
    setError(null)
    setLeido(null)

    try {
      const res = await fetch('/api/wardrobe/read-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: limpio }),
      })

      const data = (await res.json()) as {
        reference?: LeidoDelEnlace
        finalUrl?: string
        /** Si la tienda se dejo leer. Muchas grandes bloquean a los servidores. */
        leida?: boolean
        error?: string
      }

      if (!res.ok || !data.reference) {
        setError(data.error ?? 'No he podido leer esa página.')
        return
      }

      const ref = data.reference
      for (const name of CAMPOS) {
        const valor = ref[name]
        if (valor) rellenar(name, valor)
      }
      if (ref.price_cents !== null) {
        rellenar('price', (ref.price_cents / 100).toFixed(2))
      }

      // El enlace que se guarda es al que se llegó, no el que se pegó: las
      // tiendas redirigen, y el bueno es el de destino.
      const enlace = campo('source_url')
      if (enlace) enlace.value = data.finalUrl ?? limpio

      // De dónde salió esto, para la ficha.
      const origen = campo('reference_source_hint')
      if (origen) origen.value = 'link'

      // El mensaje dice lo que ha pasado de verdad. Las tiendas grandes no se
      // dejan leer por un servidor, y en ese caso la referencia sale del propio
      // enlace: conviene que se sepa, para que nadie espere el nombre y el
      // precio rellenos.
      const encontrado = CAMPOS.filter((name) => ref[name]).length
      setLeido(
        encontrado === 0
          ? 'De ese enlace no saco nada. Rellénalo a mano.'
          : ref.reference_code && !data.leida
            ? 'La tienda no se deja leer, pero la referencia venía en el enlace. Lo demás, a mano.'
            : ref.reference_code
              ? 'Listo, con referencia y todo. Revísalo.'
              : 'He cogido lo que publica. La referencia no la da: mírala en la etiqueta.',
      )
    } catch {
      setError('No he podido leer esa página. Rellena los datos a mano.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={raiz} className="border-b border-line pb-4">
      <p className="mb-2.5 text-small text-ink-soft">
        Si la compraste por internet, pega el enlace y lo relleno yo.
      </p>

      <div className="flex gap-2.5">
        <TextInput
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pega el enlace de la tienda"
          spellCheck={false}
          autoCapitalize="none"
          className="min-w-0 flex-1"
          // Enter dentro de un formulario lo enviaría; aquí solo lee el enlace.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void leer()
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          disabled={busy || url.trim() === ''}
          onClick={() => void leer()}
        >
          {busy ? 'Leyendo…' : 'Leer'}
        </Button>
      </div>

      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      {leido ? <p className="mt-2.5 text-micro text-ink-faint">{leido}</p> : null}
    </div>
  )
}
