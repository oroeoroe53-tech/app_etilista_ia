import Link from 'next/link'
import { AuthForm } from '../AuthForm'
import { signIn } from '../actions'

export const metadata = { title: 'Entrar · Estilista' }

export default function LoginPage() {
  return (
    <>
      <header className="mb-9">
        <p className="eyebrow mb-3">Estilista</p>
        <h1 className="display text-[33px] leading-[1.05]">
          Hola
          <span className="display-italic block">otra vez</span>
        </h1>
      </header>

      <AuthForm action={signIn} submitLabel="Entrar" />

      <p className="mt-7 text-center text-[11.5px] text-ink-soft">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/register" className="text-ink underline underline-offset-4">
          Crear una
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
