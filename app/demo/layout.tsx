import Link from 'next/link'
import { DemoBar } from '@/components/demo/DemoBar'

export const metadata = {
  title: 'Así funciona · Estilista',
  description: 'Un armario de ejemplo, con looks compuestos de verdad. Sin registrarse.',
}

/**
 * Demostración.
 *
 * Pública y sin cuenta: nadie se registra para ver funcionar algo que no ha
 * visto funcionar. Lo que se enseña no es una captura — las prendas pasan por
 * el mismo motor que las de cualquiera, así que lo que se ve aquí es lo que
 * hay.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-[9.5rem]">
      {/*
        Decir que es una demostración, y decirlo arriba.
        Enseñar ropa que no es tuya sin avisar de que no es tuya sería el tipo
        de truco que hace desconfiar de todo lo demás.
      */}
      <div className="border-b border-line bg-sunken/60">
        <div
          className="mx-auto flex w-full max-w-[30rem] items-center justify-between gap-4 py-2.5"
          style={{ paddingInline: 'var(--screen-gutter)' }}
        >
          <p className="eyebrow">Armario de ejemplo</p>
          <Link href="/login" className="text-[10.5px] whitespace-nowrap text-ink-faint">
            ya tengo cuenta
          </Link>
        </div>
      </div>

      {children}
      <DemoBar />
    </div>
  )
}
