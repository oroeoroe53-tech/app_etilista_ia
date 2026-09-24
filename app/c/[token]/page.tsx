import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { loadInvite } from '@/lib/circle/queries'
import { acceptInvite } from '@/app/(app)/circulo/actions'
import { Button } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Una invitación · Estilista',
  robots: { index: false, follow: false },
}

/**
 * Aceptar una invitación al círculo de alguien.
 *
 * Se ve sin cuenta —como la votación— porque quien llega tiene que poder leer
 * quién le invita antes de que le pidamos nada. Aceptar sí exige cuenta: una
 * relación entre dos personas necesita dos personas.
 *
 * La pantalla dice **qué NO pasa al aceptar**, y esa frase es la más importante
 * de aquí. Casi todas las aplicaciones aprovechan este momento para abrirlo
 * todo, contando con que nadie lee. Aceptar una invitación no enseña tu ropa a
 * nadie, y conviene saberlo antes y no descubrirlo después.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const user = await getCurrentUser()
  const invite = await loadInvite(token, user?.id ?? null)

  if (!invite) notFound()

  const next = encodeURIComponent(`/c/${token}`)

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col justify-center pt-safe pb-16"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <p className="eyebrow mb-2.5">Una invitación</p>

      <h1 className="display text-display leading-[1.06]">
        {invite.inviterName}
        <span className="display-italic block">te abre su círculo</span>
      </h1>

      {invite.state === 'open' ? (
        <>
          <p className="mt-4 text-small leading-[1.55] text-ink-soft">
            El círculo sirve para preguntaros qué poneros, prestaros ropa y no
            ir iguales a la misma boda.
          </p>

          <p className="mt-3 text-small leading-[1.55] text-ink-faint">
            Aceptar no enseña tu armario ni el suyo. Eso se da después, cada una
            por su lado, y se quita cuando quieras.
          </p>

          <div className="mt-8">
            {user ? (
              <form action={acceptInvite}>
                <input type="hidden" name="token" value={invite.token} />
                <Button type="submit" size="lg" fullWidth>
                  Entrar en su círculo
                </Button>
              </form>
            ) : (
              <>
                <Link href={`/register?next=${next}`} className="block">
                  <Button size="lg" fullWidth type="button">
                    Crear cuenta y entrar
                  </Button>
                </Link>
                <p className="mt-3.5 text-center text-small text-ink-soft">
                  ¿Ya tienes cuenta?{' '}
                  <Link
                    href={`/login?next=${next}`}
                    className="text-ink underline underline-offset-4"
                  >
                    Entrar
                  </Link>
                </p>
              </>
            )}
          </div>
        </>
      ) : (
        /*
          Un enlace que ya no sirve se explica, no se convierte en un 404: quien
          lo abre pensaría que se ha equivocado al copiarlo y lo intentaría tres
          veces más.
        */
        <>
          <p className="mt-4 text-small leading-[1.55] text-ink-soft">
            {invite.state === 'spent'
              ? 'Esta invitación ya se ha usado. Cada una vale para una persona: pídele otra.'
              : invite.state === 'expired'
                ? 'Esta invitación ha caducado. Duran una semana: pídele otra.'
                : invite.state === 'already'
                  ? 'Ya estáis en el círculo la una de la otra. No hay nada que aceptar.'
                  : 'Esta invitación es tuya. Mándasela a quien quieras invitar.'}
          </p>

          <div className="mt-8">
            <Link href={user ? '/circulo' : '/'} className="block">
              <Button size="lg" fullWidth type="button" variant="secondary">
                {user ? 'Ver tu círculo' : 'Ver qué es esto'}
              </Button>
            </Link>
          </div>
        </>
      )}

      <footer className="mt-12 border-t border-line pt-6 text-center">
        <p className="text-small leading-[1.6] text-ink-faint">
          Esto es <span className="display text-ink">Estilista</span>: te propone
          qué ponerte con la ropa que ya tienes.
        </p>
      </footer>
    </main>
  )
}
