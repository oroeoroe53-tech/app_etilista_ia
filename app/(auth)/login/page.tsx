import Link from 'next/link'
import { AuthForm } from '../AuthForm'
import { signIn } from '../actions'

export const metadata = { title: 'Entrar · Estilista' }

export default function LoginPage() {
  return (
    <>
      <header className="mb-10">
        <p className="eyebrow mb-3">Estilista</p>
        <h1 className="display text-4xl">Hola otra vez</h1>
      </header>

      <AuthForm action={signIn} submitLabel="Entrar" />

      <p className="mt-8 text-center text-sm text-ink-soft">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/register" className="text-ink underline underline-offset-4">
          Crear una
        </Link>
      </p>
    </>
  )
}
