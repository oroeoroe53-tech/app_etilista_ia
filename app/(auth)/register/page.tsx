import Link from 'next/link'
import { AuthForm } from '../AuthForm'
import { signUp } from '../actions'
import { safeNext } from '@/lib/utils/next-url'

export const metadata = { title: 'Crear cuenta · Estilista' }

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const next = safeNext((await searchParams).next)
  const voting = next.startsWith('/v/')
  const query = next === '/' ? '' : `?next=${encodeURIComponent(next)}`

  return (
    <>
      {/*
        Dos titulares, según de dónde venga.

        Quien llega por una votación no está buscando un armario digital: está a
        un toque de decirle a una amiga cuál le queda mejor. Recibirle con el
        argumento de venta del producto entero es cambiarle de conversación.
      */}
      <header className="mb-9">
        <p className="eyebrow mb-3">Estilista</p>
        {voting ? (
          <>
            <h1 className="display text-display leading-[1.05]">
              Crea tu cuenta
              <span className="display-italic block">y vota</span>
            </h1>
            <p className="mt-3.5 text-small leading-[1.5] text-ink-soft">
              Son treinta segundos y vuelves a la votación donde lo dejaste. Tu
              voto se cuenta al llegar.
            </p>
          </>
        ) : (
          <h1 className="display text-display leading-[1.05]">
            Enséñale cómo vistes
            <span className="display-italic block">y aprenderá a vestirte</span>
          </h1>
        )}
      </header>

      <AuthForm action={signUp} submitLabel="Crear cuenta" withName next={next} />

      <p className="mt-7 text-center text-small text-ink-soft">
        ¿Ya tienes cuenta?{' '}
        <Link href={`/login${query}`} className="text-ink underline underline-offset-4">
          Entrar
        </Link>
      </p>

      {/*
        Las dos puertas para quien todavía no es nadie aquí: ver funcionar la
        aplicación sin dar nada, y llevársela al móvil. Discretas, porque la
        tarea de esta pantalla es entrar.
      */}
      <p className="mt-5 text-center text-micro leading-[1.8] text-ink-faint">
        <Link href="/demo" className="text-ink-soft underline underline-offset-4">
          Ver cómo funciona sin registrarse
        </Link>
        <span className="mx-2" aria-hidden>
          ·
        </span>
        <Link href="/instalar" className="underline underline-offset-4">
          Ponerla en tu móvil
        </Link>
      </p>
    </>
  )
}
