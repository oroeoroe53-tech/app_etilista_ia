import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { Screen, Meter } from '@/components/ui'
import { Tile } from '@/components/social/Tile'
import { checkEntitlement } from '@/lib/subscriptions/entitlements'
import { PLAN_LABELS, formatPrice, type Feature } from '@/lib/subscriptions/plans'
import { countIncoming } from '@/lib/loans/queries'
import { signOut } from '@/app/(auth)/actions'
import { DeleteAccount } from '@/components/account/DeleteAccount'
import { UpgradeCta } from '@/components/account/UpgradeCta'

export const dynamic = 'force-dynamic'

const TRACKED: Array<{ feature: Feature; label: string; period: string }> = [
  { feature: 'add_clothing_item', label: 'Prendas en el armario', period: 'en total' },
  { feature: 'analyze_outfit', label: 'Análisis de fotos', period: 'este mes' },
  { feature: 'request_outfits', label: 'Propuestas', period: 'hoy' },
  { feature: 'swipe', label: 'Looks valorados', period: 'hoy' },
]

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  /*
   * Ya no hace falta leer `profiles`: la cabecera enseña el logotipo y el
   * correo, que vienen de la sesión. Una consulta menos en cada visita.
   */
  const [checks, pendingLoans] = await Promise.all([
    Promise.all(TRACKED.map((entry) => checkEntitlement(user.id, entry.feature))),
    countIncoming(user.id),
  ])

  const plan = checks[0]?.plan ?? 'free'

  // "desde marzo": la fecha de alta, sin año. El año sobra cuando la cuenta es
  // de hace meses y estorba cuando es de hace semanas.
  const desde = user.created_at
    ? new Date(user.created_at).toLocaleDateString('es-ES', { month: 'long' })
    : null

  return (
    <Screen>
      <header className="pt-5 pb-5">
        <p className="eyebrow mb-2.5">Tu cuenta</p>
        <div className="flex items-start justify-between gap-4">
          {/*
            El logotipo, que aquí es la única vez que la aplicación dice su
            propio nombre. En el resto de pantallas no hace falta: quien la
            abre ya sabe dónde está.
          */}
          <h1 className="display text-display-l leading-none">Selyqo</h1>
          <p className="shrink-0 pt-1 text-right text-small leading-[1.5] text-ink-soft">
            {user.email}
            {desde ? <span className="block">desde {desde}</span> : null}
          </p>
        </div>
      </header>

      {/* --- Plan ---------------------------------------------------------- */}
      <div className="rounded-[24px] bg-raised p-4 shadow-card">
        <div className="mb-4 flex items-baseline justify-between">
          <p className="eyebrow">Plan</p>
          <span className="display text-title">{PLAN_LABELS[plan]}</span>
        </div>

        <ul className="space-y-3.5">
          {TRACKED.map((entry, index) => {
            const check = checks[index]
            if (!check) return null
            const pct = check.limit > 0 ? Math.min(100, (check.used / check.limit) * 100) : 0

            return (
              <li key={entry.feature}>
                <div className="mb-1.5 flex items-baseline justify-between gap-4">
                  <span className="min-w-0 text-small leading-[1.35] text-ink">
                    {entry.label} <span className="text-ink-faint">{entry.period}</span>
                  </span>
                  <span className="shrink-0 text-small tabular-nums whitespace-nowrap text-ink">
                    {check.used}
                    <span className="text-ink-faint"> / {check.limit}</span>
                  </span>
                </div>
                <Meter value={pct} label={entry.label} />
              </li>
            )
          })}
        </ul>

        <p className="mt-4 text-micro leading-[1.4] text-ink-faint">
          Los contadores diarios se reinician a medianoche.
        </p>
      </div>

      {/* --- Pasar al plan completo ---------------------------------------- */}
      {plan === 'free' ? (
        <div className="mt-4">
          <UpgradeCta label={`Pasar a Selyqo completo · ${formatPrice('pro')}/mes`} />
        </div>
      ) : null}

      {/* --- Lo que cuelga de aquí -------------------------------------------
          Eran ocho filas iguales con flecha, el mismo problema que tenían la
          portada y Social. Aquí además escondían lo único que esta pantalla
          tiene que gritar: los préstamos sin contestar.

          La instalación también desde aquí, no solo desde la pantalla de
          entrar: mucha gente usa la web unos días antes de decidirse a
          instalarla, y para entonces ya no vuelve a pasar por el login. */}
      <ul className="mt-7 grid grid-cols-6 gap-2.5">
        {/*
          Estilo cedió su pestaña a Social, así que su puerta está aquí. Sigue
          entera: lo que cambió es cuánto se cruza uno con ella, no qué es. Por
          eso va la primera y a media pantalla, y no perdida entre ajustes.
        */}
        <Tile span={3} href="/estilo" title="Tu estilo" note="Lo que he aprendido de ti" />

        {/*
          El círculo, porque es lo único de aquí que tiene consecuencias para
          otra gente y lo único que alguien puede querer revisar un martes
          cualquiera para comprobar quién ve su ropa.
        */}
        <Tile span={3} href="/circulo" title="Tu círculo" note="Y lo que ve cada una" />

        {/*
          Los préstamos, con el número de peticiones sin contestar.

          Esta aplicación no manda notificaciones ni correos, así que este
          número es el ÚNICO sitio donde alguien se entera de que una amiga le
          ha pedido algo. Sin él, la mitad de las peticiones morirían sin
          respuesta y la función parecería rota cuando solo está callada. En una
          fila cabía una pastilla diminuta; aquí ocupa media pantalla cuando hay
          algo y un tercio cuando no.
        */}
        <Tile
          span={pendingLoans > 0 ? 3 : 2}
          href="/prestamos"
          title="Préstamos"
          note={pendingLoans > 0 ? 'Esperando tu respuesta' : 'Quién tiene qué'}
          badge={pendingLoans > 0 ? pendingLoans : undefined}
        />

        <Tile
          span={pendingLoans > 0 ? 3 : 2}
          href="/vestir"
          title="Te han vestido"
          note="Looks que te han montado"
        />

        <Tile span={pendingLoans > 0 ? 3 : 2} href="/eventos" title="Eventos" note="Sin ir iguales" />

        {/* Se estira cuando los préstamos encogen: si no, la fila queda a medias. */}
        <Tile
          span={pendingLoans > 0 ? 3 : 6}
          href="/instalar"
          title="En tu móvil"
          note="Ponerla en la pantalla de inicio"
        />
      </ul>

      {/*
        Cerrar sesión y la privacidad no son destinos que se visiten: son lo que
        se busca cuando hace falta. En piezas con relieve competirían con lo de
        arriba y darían ganas de pulsarlas sin querer.
      */}
      <div className="mt-7">
        <Link
          href="/privacidad"
          className="flex items-center justify-between gap-4 border-t border-line py-3.5"
        >
          <span className="text-small leading-[1.35] text-ink-soft">Qué hago con tus datos</span>
          <span aria-hidden className="shrink-0 text-small text-ink-faint">
            →
          </span>
        </Link>

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center justify-between gap-4 border-t border-b border-line py-3.5 text-left"
          >
            <span className="text-small leading-[1.35] text-ink-soft">Cerrar sesión</span>
            <span aria-hidden className="shrink-0 text-small text-ink-faint">
              →
            </span>
          </button>
        </form>
      </div>

      <div className="mt-8">
        <DeleteAccount email={user.email ?? ''} />
      </div>
    </Screen>
  )
}
