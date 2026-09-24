import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listCircle } from '@/lib/circle/queries'
import { listDuels } from '@/lib/duels/queries'
import { DuelForm } from '@/components/social/DuelForm'
import { BackLink } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Duelo de armarios · Selyqo' }

/**
 * Los duelos vivos, y el formulario para empezar otro.
 *
 * Arriba lo que espera algo de ti —un reto sin contestar—, porque un reto que
 * nadie contesta es la forma más rápida de que esta función muera.
 */
export default async function DuelsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [circle, duels] = await Promise.all([listCircle(user.id), listDuels(user.id)])

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/social">social</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">A ciegas</p>
        <h1 className="display text-display leading-[1.06]">
          Duelo de
          <span className="display-italic block">armarios</span>
        </h1>
        <p className="mt-3 text-small leading-[1.5] text-ink-soft">
          Tu estilista monta un look con tu ropa, ella con la suya, y vuestro
          círculo vota sin saber cuál es de quién.
        </p>
      </header>

      {duels.length > 0 ? (
        <section className="mb-9">
          <p className="eyebrow mb-3">En marcha</p>
          <ul className="space-y-2.5">
            {duels.map((duel) => (
              <li key={duel.id}>
                <Link
                  href={`/social/duelo/${duel.id}`}
                  className="press sheen sheen-paper lift-paper flex items-center justify-between gap-4 rounded-[22px] border border-line p-3.5"
                >
                  <span className="min-w-0">
                    <span className="display block truncate text-lead">
                      {duel.otherName}
                    </span>
                    <span className="mono mt-0.5 block truncate text-ink-faint">
                      {duel.occasion}
                    </span>
                  </span>
                  {duel.needsAnswer ? (
                    <span className="mono shrink-0 rounded-full bg-clay px-2 py-[3px] text-micro text-[#f7f4ee]">
                      te retan
                    </span>
                  ) : (
                    <span aria-hidden className="shrink-0 text-small text-ink-faint">
                      →
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DuelForm friends={circle.map((member) => ({ id: member.id, name: member.name }))} />
    </div>
  )
}
