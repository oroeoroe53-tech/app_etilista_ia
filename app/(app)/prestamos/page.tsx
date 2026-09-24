import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { getLoanBoard, type LoanView } from '@/lib/loans/queries'
import { describeGarment } from '@/lib/wardrobe/labels'
import { decideLoan, returnLoan, cancelLoan } from './actions'
import { BackLink, EmptyState, PhotoSlot } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Préstamos · Estilista' }

/**
 * Quién tiene qué.
 *
 * El orden de los bloques no es casual, va del más urgente al más tranquilo:
 * lo que te han pedido y no has contestado, lo que tienes en casa y no es tuyo,
 * lo que esperas, y lo tuyo que anda por ahí. Es el orden en que la gente
 * necesita mirarlo.
 *
 * Aquí no hay notificaciones. Esta aplicación no manda correos ni avisos al
 * móvil, así que este es el sitio donde uno se entera, y por eso Perfil enseña
 * cuántas peticiones esperan.
 */
export default async function LoansPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const board = await getLoanBoard(user.id)
  const empty =
    board.incoming.length + board.borrowed.length + board.outgoing.length + board.lentOut.length ===
    0

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/perfil">perfil</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Entre vosotras</p>
        <h1 className="display text-display leading-[1.06]">
          Quién tiene
          <span className="display-italic block">qué</span>
        </h1>
      </header>

      {empty ? (
        <EmptyState
          title="Nada prestado"
          body="Cuando alguien de tu círculo te deje ver su armario, podrás pedirle una prenda desde ahí."
        />
      ) : (
        <>
          <Section title="Te la han pedido" items={board.incoming}>
            {(loan) => (
              <div className="mt-2.5 flex gap-1.5">
                <form action={decideLoan}>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <button
                    type="submit"
                    name="decision"
                    value="accept"
                    className="rounded-full bg-accent px-4 py-[9px] text-small text-accent-ink"
                  >
                    Se la dejo
                  </button>
                </form>
                <form action={decideLoan}>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <button
                    type="submit"
                    name="decision"
                    value="decline"
                    className="rounded-full border border-[color-mix(in_srgb,var(--ink)_16%,transparent)] px-4 py-[9px] text-small text-ink-soft"
                  >
                    Ahora no
                  </button>
                </form>
              </div>
            )}
          </Section>

          <Section title="Tienes en casa" items={board.borrowed}>
            {(loan) => (
              <form action={returnLoan} className="mt-2.5">
                <input type="hidden" name="loanId" value={loan.id} />
                <button
                  type="submit"
                  className="rounded-full border border-[color-mix(in_srgb,var(--ink)_16%,transparent)] px-4 py-[9px] text-small text-ink-soft"
                >
                  Ya se la he devuelto
                </button>
              </form>
            )}
          </Section>

          <Section title="Esperas respuesta" items={board.outgoing}>
            {(loan) => (
              <form action={cancelLoan} className="mt-2">
                <input type="hidden" name="loanId" value={loan.id} />
                <button type="submit" className="py-1 text-micro text-ink-faint">
                  cancelar la petición
                </button>
              </form>
            )}
          </Section>

          <Section title="Tuyas fuera de casa" items={board.lentOut}>
            {(loan) => (
              <form action={returnLoan} className="mt-2.5">
                <input type="hidden" name="loanId" value={loan.id} />
                <button
                  type="submit"
                  className="rounded-full border border-[color-mix(in_srgb,var(--ink)_16%,transparent)] px-4 py-[9px] text-small text-ink-soft"
                >
                  Ya me la ha devuelto
                </button>
              </form>
            )}
          </Section>
        </>
      )}

      <p className="mt-10 border-t border-line pt-6 text-micro leading-[1.6] text-ink-faint">
        Mientras una prenda tuya está prestada, no te la propongo: no puedes
        ponerte lo que no tienes en casa. Al volver queda como estaba.
      </p>
    </div>
  )
}

function Section({
  title,
  items,
  children,
}: {
  title: string
  items: LoanView[]
  children: (loan: LoanView) => React.ReactNode
}) {
  if (items.length === 0) return null

  return (
    <section className="mb-9">
      <p className="eyebrow mb-3">{title}</p>
      <ul>
        {items.map((loan) => (
          <li key={loan.id} className="flex gap-3.5 border-t border-line py-3.5 last:border-b">
            <PhotoSlot
              src={loan.imageUrl}
              label={describeGarment(loan.itemLabel)}
              showLabel={false}
              className="h-[74px] w-[58px] shrink-0 rounded-2xl"
            />
            <div className="min-w-0 flex-1">
              <p className="display truncate text-lead">
                {describeGarment(loan.itemLabel)}
              </p>
              <p className="mono mt-0.5 truncate text-ink-faint">{loan.otherName.toLowerCase()}</p>
              {loan.message ? (
                <p className="mt-1 truncate text-small text-ink-soft">«{loan.message}»</p>
              ) : null}
              {children(loan)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
