import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { getDuel, type DuelSide } from '@/lib/duels/queries'
import { acceptDuel, declineDuel, voteDuel } from '../actions'
import { BackLink, Notice, PhotoSlot } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Duelo de armarios · Estilista' }

/**
 * Un duelo, a ciegas.
 *
 * Mientras no votas, los nombres **no llegan al navegador**: se quedan en el
 * servidor (`lib/duels/queries.ts`). Esconderlos con CSS sería un juego que se
 * rompe mirando el código, y quien juega a esto se lo huele.
 */
export default async function DuelPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const duel = await getDuel(id, user.id)
  if (!duel) notFound()

  const [a, b] = duel.sides
  const total = (a?.votes ?? 0) + (b?.votes ?? 0)
  const canVote = duel.status === 'open' && !duel.amChallenger && !duel.amOpponent

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/social">social</BackLink>

      <header className="pt-2 pb-6">
        <p className="eyebrow mb-2.5">
          Duelo · {duel.revealed ? 'a la vista' : 'a ciegas'}
        </p>
        <h1 className="display text-display leading-[1.06]">
          Duelo de
          <span className="display-italic block">armarios</span>
        </h1>
        <p className="mt-3 text-small text-ink-soft">Ocasión: {duel.occasion}</p>
      </header>

      {/* --- Esperando respuesta --------------------------------------------- */}
      {duel.status === 'pending' ? (
        duel.amOpponent ? (
          <section>
            <Notice>
              {duel.challengerName} te reta. Si aceptas, tu estilista monta un
              look con tu ropa y vuestro círculo vota sin saber cuál es de quién.
            </Notice>
            <div className="mt-5 flex gap-2.5">
              <form action={acceptDuel} className="flex-1">
                <input type="hidden" name="duelId" value={duel.id} />
                <button
                  type="submit"
                  className="h-[46px] w-full rounded-full bg-accent text-small font-medium text-accent-ink"
                >
                  Acepto
                </button>
              </form>
              <form action={declineDuel}>
                <input type="hidden" name="duelId" value={duel.id} />
                <button
                  type="submit"
                  className="h-[46px] rounded-full border border-line px-5 text-small text-ink-soft"
                >
                  Ahora no
                </button>
              </form>
            </div>
            <p className="mt-3 text-micro leading-[1.6] text-ink-faint">
              Tu ropa no entra en el duelo hasta que aceptes. Si dices que no,
              no se compone nada y ella solo ve que has dicho que no.
            </p>
          </section>
        ) : (
          <Notice>
            Esperando a que {duel.opponentName} acepte. Hasta entonces no se
            compone su look ni lo ve nadie.
          </Notice>
        )
      ) : null}

      {duel.status === 'declined' ? (
        <Notice>{duel.opponentName} ha dicho que ahora no.</Notice>
      ) : null}

      {/* --- El duelo --------------------------------------------------------- */}
      {duel.status === 'open' || duel.status === 'closed' ? (
        <>
          <ul className="grid grid-cols-2 gap-2.5">
            {duel.sides.map((side) => (
              <li key={side.side}>
                <Side
                  side={side}
                  total={total}
                  revealed={duel.revealed}
                  mine={duel.myVote === side.side}
                  canVote={canVote}
                  duelId={duel.id}
                />
              </li>
            ))}
          </ul>

          <p className="mt-4 text-center text-micro leading-[1.6] text-ink-faint">
            {duel.revealed
              ? total === 0
                ? 'Todavía no ha votado nadie.'
                : `${total} ${total === 1 ? 'voto' : 'votos'}.`
              : 'Los nombres salen cuando votes. Nadie sabe de quién es cada armario.'}
          </p>

          {duel.amChallenger || duel.amOpponent ? (
            <p className="mt-2 text-center text-micro text-ink-faint">
              No votas en tu propio duelo.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Side({
  side,
  total,
  revealed,
  mine,
  canVote,
  duelId,
}: {
  side: DuelSide
  total: number
  revealed: boolean
  mine: boolean
  canVote: boolean
  duelId: string
}) {
  const [first, ...rest] = side.garments
  const share = total === 0 ? 0 : Math.round((side.votes / total) * 100)

  const art = (
    <>
      <div className="flex h-[186px] gap-1.5">
        <PhotoSlot
          src={first?.imageUrl ?? null}
          label={first?.label ?? ''}
          showLabel={false}
          className="min-w-0 flex-[1.4] rounded-[20px]"
        />
        {rest.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {rest.slice(0, 2).map((garment) => (
              <PhotoSlot
                key={garment.id}
                src={garment.imageUrl}
                label={garment.label}
                showLabel={false}
                className="min-h-0 flex-1 rounded-[20px]"
              />
            ))}
          </div>
        ) : null}
      </div>

      <p className="display mt-2.5 text-lead">
        {revealed ? side.name : `Armario ${side.side.toUpperCase()}`}
      </p>
      {revealed ? (
        <p className="mono mt-1 text-ink-faint">
          {side.votes} {side.votes === 1 ? 'voto' : 'votos'} · {share}%
          {mine ? ' · tu voto' : ''}
        </p>
      ) : null}
    </>
  )

  if (!canVote) return <div>{art}</div>

  return (
    <form action={voteDuel}>
      <input type="hidden" name="duelId" value={duelId} />
      <input type="hidden" name="side" value={side.side} />
      <button
        type="submit"
        className={cn(
          'block w-full rounded-[var(--radius-card)] p-1 text-left',
          mine && 'ring-2 ring-accent',
        )}
      >
        {art}
      </button>
    </form>
  )
}
