import Link from 'next/link'
import { AuthForm } from '../AuthForm'
import { signUp } from '../actions'

export const metadata = { title: 'Crear cuenta · Estilista' }

export default function RegisterPage() {
  return (
    <>
      <header className="mb-9">
        <p className="eyebrow mb-3">Estilista</p>
        <h1 className="display text-[33px] leading-[1.05]">
          Enséñale cómo vistes
          <span className="display-italic block">y aprenderá a vestirte</span>
        </h1>
      </header>

      <AuthForm action={signUp} submitLabel="Crear cuenta" withName />

      <p className="mt-7 text-center text-[11.5px] text-ink-soft">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-ink underline underline-offset-4">
          Entrar
        </Link>
      </p>
      {/*
        La puerta de la instalación.

        Va aquí porque es la primera pantalla que ve quien llega desde fuera, y
        porque instalarla no exige tener cuenta. Discreta: la tarea del día es
        entrar, no instalar.
      */}
      <p className="mt-5 text-center text-[10.5px] text-ink-faint">
        <Link href="/instalar" className="underline underline-offset-4">
          Cómo ponerla en tu móvil
        </Link>
      </p>
    </>
  )
}
