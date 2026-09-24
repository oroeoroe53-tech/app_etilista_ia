import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listStyledLooks, type StyledLook } from '@/lib/styled/queries'
import { describeGarment } from '@/lib/wardrobe/labels'
import { markLookSeen, deleteStyledLook } from './actions'
import { BackLink, EmptyState, PhotoSlot } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Te han vestido · Estilista' }

/**
 * Los looks que alguien te ha montado, y los que has montado tú.
 *
 * Primero los que te han mandado, y dentro de esos, los que no has visto.
 * Quien monta un look para otra persona se ha tomado un rato mirando su ropa:
 * lo mínimo es que no se pierda debajo de nada.
 */
export default async function StyledLooksPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const looks = await listStyledLooks(user.id)
  const received = looks.filter((l) => l.forMe)
  const sent = looks.filter((l) => !l.forMe)

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/perfil">perfil</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Con tu ropa</p>
        <h1 className="display text-display leading-[1.06]">
          Te han
          <span className="display-italic block">vestido</span>
        </h1>
      </header>

      {looks.length === 0 ? (
        <EmptyState
          title="Todavía nada"
          body="Cuando alguien de tu círculo te deje montarle looks —o tú a ella— aparecerán aquí."
        />
      ) : (
        <>
          {received.length > 0 ? (
            <section className="mb-9">
              <p className="eyebrow mb-3">Para ti</p>
              {received.map((look) => (
                <LookCard key={look.id} look={look} />
              ))}
            </section>
          ) : null}

          {sent.length > 0 ? (
            <section>
              <p className="eyebrow mb-3">Los que has montado</p>
              {sent.map((look) => (
                <LookCard key={look.id} look={look} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function LookCard({ look }: { look: StyledLook }) {
  return (
    <article className="border-t border-line py-4 last:border-b">
      <div className="flex items-baseline justify-between gap-4">
        <p className="display truncate text-lead">
          {look.forMe ? `De ${look.otherName}` : `Para ${look.otherName}`}
        </p>

        {/*
          «sin ver» solo se le enseña a quien lo montó: es lo primero que se
          pregunta al mandar algo. A quien lo recibe no se le recuerda lo que
          debe.
        */}
        {!look.forMe && !look.seenAt ? (
          <span className="mono shrink-0 text-ink-faint">sin ver</span>
        ) : null}
      </div>

      {look.note ? (
        <p className="mt-1.5 text-small leading-[1.5] text-ink-soft">«{look.note}»</p>
      ) : null}

      <ul className="bleed-row mt-3 flex gap-2">
        {look.items.map((item) => (
          <li key={item.id} className="shrink-0">
            <PhotoSlot
              src={item.imageUrl}
              label={describeGarment(item)}
              showLabel={false}
              className="h-[104px] w-[80px] rounded-2xl"
            />
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-4">
        {look.forMe && !look.seenAt ? (
          <form action={markLookSeen}>
            <input type="hidden" name="lookId" value={look.id} />
            <button
              type="submit"
              className="rounded-full bg-accent px-4 py-[9px] text-small text-accent-ink"
            >
              Visto, gracias
            </button>
          </form>
        ) : null}

        <form action={deleteStyledLook}>
          <input type="hidden" name="lookId" value={look.id} />
          <button type="submit" className="py-1 text-micro text-ink-faint">
            quitar
          </button>
        </form>
      </div>
    </article>
  )
}
