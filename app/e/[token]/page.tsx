import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { loadEventInvite } from '@/lib/events/queries'
import { formatEventDate } from '@/lib/events/format'
import { joinEvent } from '@/app/(app)/eventos/actions'
import { Button } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Un evento · Estilista',
  robots: { index: false, follow: false },
}

/**
 * Apuntarse a un evento desde el enlace.
 *
 * Se ve sin cuenta, como la votación y la invitación al círculo: quien llega
 * tiene que poder leer a qué le invitan antes de que le pidamos nada.
 *
 * El enlace de un evento **no es de un solo uso**, a diferencia del círculo:
 * este se manda al grupo entero de la boda. Puede hacerse porque apuntarse aquí
 * no abre el armario de nadie; solo deja ver qué piensa ponerse la gente de
 * este evento.
 */
export default async function EventInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const user = await getCurrentUser()
  const invite = await loadEventInvite(token, user?.id ?? null)

  if (!invite) notFound()

  const next = encodeURIComponent(`/e/${token}`)

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col justify-center pt-safe pb-16"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <p className="eyebrow mb-2.5">
        {formatEventDate(invite.heldOn)}
        {invite.place ? ` · ${invite.place}` : ''}
      </p>

      <h1 className="display text-[32px] leading-[1.06]">
        {invite.title}
        <span className="display-italic block">de {invite.ownerName}</span>
      </h1>

      {invite.state === 'open' ? (
        <>
          <p className="mt-4 text-[12px] leading-[1.55] text-ink-soft">
            Apúntate y di qué piensas ponerte. Así veis todas de qué va cada
            una y nadie repite vestido.
          </p>
          <p className="mt-3 text-[11.5px] leading-[1.55] text-ink-faint">
            Solo lo ven las personas de este evento, y se borra entero una
            semana después.
          </p>

          <div className="mt-8">
            {user ? (
              <form action={joinEvent}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit" size="lg" fullWidth>
                  Apuntarme
                </Button>
              </form>
            ) : (
              <>
                <Link href={`/register?next=${next}`} className="block">
                  <Button size="lg" fullWidth type="button">
                    Crear cuenta y apuntarme
                  </Button>
                </Link>
                <p className="mt-3.5 text-center text-[11px] text-ink-soft">
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
        <>
          <p className="mt-4 text-[12px] leading-[1.55] text-ink-soft">
            {invite.state === 'expired'
              ? 'Este evento ya pasó y se ha borrado.'
              : 'Ya estás apuntada a este evento.'}
          </p>

          <div className="mt-8">
            <Link
              href={invite.state === 'already' ? `/eventos/${invite.eventId}` : '/eventos'}
              className="block"
            >
              <Button size="lg" fullWidth type="button" variant="secondary">
                {invite.state === 'already' ? 'Ver el evento' : 'Ver tus eventos'}
              </Button>
            </Link>
          </div>
        </>
      )}

      <footer className="mt-12 border-t border-line pt-6 text-center">
        <p className="text-[11px] leading-[1.6] text-ink-faint">
          Esto es <span className="display text-ink">Estilista</span>: te propone
          qué ponerte con la ropa que ya tienes.
        </p>
      </footer>
    </main>
  )
}
