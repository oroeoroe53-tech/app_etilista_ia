import Link from 'next/link'
import { RecoverForm } from '@/components/auth/RecoverForm'

export const metadata = { title: 'Recuperar la contraseña · Estilista' }

/**
 * Recuperar la contraseña.
 *
 * Pública, evidentemente: quien llega aquí no puede entrar. Sin esto, olvidar
 * la contraseña significaba perder el armario, las fotos y el perfil de estilo
 * sin más salida que escribirle a alguien.
 */
export default function RecoverPage() {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col justify-center py-12"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="mb-9">
        <p className="eyebrow mb-3">Estilista</p>
        <h1 className="display text-[33px] leading-[1.05]">
          No pasa nada
          <span className="display-italic block">te mando un enlace</span>
        </h1>
        <p className="mt-3.5 text-[11.5px] leading-[1.5] text-ink-soft">
          Tu armario sigue donde estaba. Solo hay que poner una contraseña nueva.
        </p>
      </header>

      <RecoverForm />

      <p className="mt-7 text-center text-[11.5px] text-ink-soft">
        <Link href="/login" className="underline underline-offset-4">
          Me he acordado, quiero entrar
        </Link>
      </p>
    </main>
  )
}
