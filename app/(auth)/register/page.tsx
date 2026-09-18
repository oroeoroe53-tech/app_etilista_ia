import Link from 'next/link'
import { AuthForm } from '../AuthForm'
import { signUp } from '../actions'

export const metadata = { title: 'Crear cuenta · Estilista' }

export default function RegisterPage() {
  return (
    <>
      <header className="mb-10">
        <p className="eyebrow mb-3">Estilista</p>
        <h1 className="display text-4xl leading-tight">
          Enséñale cómo vistes
          <br />y aprenderá a vestirte
        </h1>
      </header>

      <AuthForm action={signUp} submitLabel="Crear cuenta" withName />

      <p className="mt-8 text-center text-sm text-ink-soft">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-ink underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </>
  )
}
