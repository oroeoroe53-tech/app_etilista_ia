import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { getChallengeState } from '@/lib/challenges/queries'
import { CHALLENGES, challengeOfWeek, weekStart } from '@/lib/challenges/catalogue'
import { joinChallenge, leaveChallenge, markChallengeDone } from '../actions'
import { BackLink, Meter } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Reto de la semana · Estilista' }

/**
 * El reto de la semana.
 *
 * Uno, no una lista: con cinco retos a la vez no hay ninguno. Es el mismo para
 * todo el mundo la misma semana, que es lo que permite hablar de él con las
 * amigas, y el progreso sale de lo que te has puesto de verdad.
 *
 * Abajo, los que vienen. No para picar a nadie, sino porque saber que el lunes
 * toca «una semana sin negro» es lo que hace que alguien piense en su armario
 * el domingo.
 */
export default async function ChallengesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const state = await getChallengeState(user.id)
  const { challenge, progress } = state

  /*
   * Si ya está completado, se deja constancia.
   *
   * En `after()`, o sea después de pintar la pantalla: dejar constancia no debe
   * hacer esperar a nadie. Y no es una casilla que alguien marque —el progreso
   * ya venía calculado del historial—, sino anotar algo que ya es verdad para
   * poder contarlo en el resumen del mes sin recalcular doce semanas.
   */
  if (state.joined && progress.completed) {
    after(async () => {
      await markChallengeDone(challenge.id)
    })
  }

  // Los siguientes, en el orden en que van a tocar.
  const upcoming = [1, 2, 3].map((offset) =>
    challengeOfWeek(new Date(Date.parse(weekStart()) + offset * 7 * 86_400_000)),
  )

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/social">social</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Retos</p>
        <h1 className="display text-display leading-[1.06]">
          Esta semana
          <span className="display-italic block">se lleva esto</span>
        </h1>
      </header>

      <section className="rounded-[var(--radius-card)] bg-raised p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="display text-title leading-[1.1]">{challenge.name}</p>
          <span className="mono shrink-0 tabular-nums text-clay">
            {progress.done}/{progress.target}
          </span>
        </div>

        <p className="mt-2 text-small leading-[1.5] text-ink-soft">
          {challenge.description}
        </p>

        <div className="mt-4">
          <Meter value={(progress.done / progress.target) * 100} label="Progreso del reto" tone="clay" />
        </div>

        <p className="mt-3 text-micro leading-[1.5] text-ink-faint">
          {progress.completed
            ? 'Completado. No hay que marcar nada: sale de lo que te has puesto.'
            : 'Se cuenta solo, de lo que marcas como puesto cada día.'}
        </p>

        {/*
          Quién más se ha apuntado, por su nombre. Un número —«12 personas»— no
          significaría nada aquí: lo que hace que alguien se apunte es que lo
          haya hecho su amiga, no doce desconocidas.
        */}
        {state.others.length > 0 ? (
          <p className="mt-3 text-small text-ink-soft">
            {state.others.slice(0, 3).join(', ')}
            {state.others.length > 3 ? ` y ${state.others.length - 3} más` : ''} también
            {state.others.length === 1 ? ' está' : ' están'} con este.
          </p>
        ) : null}

        <form action={state.joined ? leaveChallenge : joinChallenge} className="mt-4">
          <input type="hidden" name="challengeId" value={challenge.id} />
          <button
            type="submit"
            className={
              state.joined
                ? 'w-full py-2 text-center text-small text-ink-faint underline underline-offset-4'
                : 'h-[46px] w-full rounded-full bg-accent text-small font-medium text-accent-ink'
            }
          >
            {state.joined ? 'Salirme del reto' : 'Me apunto'}
          </button>
        </form>
      </section>

      <section className="mt-9">
        <p className="eyebrow mb-3">Lo que viene</p>
        <ul className="space-y-2.5">
          {upcoming.map((next, index) => (
            <li
              key={`${next.id}-${index}`}
              className="lift-paper rounded-[22px] border border-line p-3.5"
            >
              <p className="display text-lead">{next.name}</p>
              <p className="mt-0.5 text-small text-ink-soft">{next.description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-micro leading-[1.6] text-ink-faint">
          Son {CHALLENGES.length} y van rotando. Ninguno pide comprar nada: todos
          se ganan con la ropa que ya tienes.
        </p>
      </section>
    </div>
  )
}
