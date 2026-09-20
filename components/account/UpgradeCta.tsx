'use client'

import { useState } from 'react'

/**
 * Pasar al plan completo.
 *
 * Todavía no hay forma de pagar: no hay pasarela conectada. Un botón que
 * parece llevar a una compra y no lleva a ninguna parte es una promesa rota en
 * la pantalla donde peor sienta, así que este dice la verdad en cuanto se
 * pulsa, y no antes: escribir "próximamente" en el botón sería renunciar a
 * saber cuánta gente lo intenta, que es justo el dato que hace falta para
 * decidir si merece la pena montar el cobro.
 */
export function UpgradeCta({ label }: { label: string }) {
  const [asked, setAsked] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setAsked(true)}
        className="h-[54px] w-full rounded-full bg-accent text-[13px] font-medium tracking-[0.03em] text-accent-ink active:opacity-85"
      >
        {label}
      </button>

      {asked ? (
        <p role="status" className="mt-2.5 text-center text-[11px] leading-[1.5] text-ink-soft">
          Todavía no se puede pagar: el cobro no está montado. Mientras tanto tienes
          el plan gratuito entero, sin recortes.
        </p>
      ) : null}
    </div>
  )
}
