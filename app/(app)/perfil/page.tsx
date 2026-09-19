import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { Screen, PageTitle, Card, Button } from '@/components/ui'
import { checkEntitlement } from '@/lib/subscriptions/entitlements'
import { PLAN_LABELS, type Feature } from '@/lib/subscriptions/plans'
import { signOut } from '@/app/(auth)/actions'
import { DeleteAccount } from '@/components/account/DeleteAccount'

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

  const supabase = await createClient()

  const [{ data: profileRow }, ...checks] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    ...TRACKED.map((entry) => checkEntitlement(user.id, entry.feature)),
  ])

  const displayName = (profileRow as { display_name?: string } | null)?.display_name
  const plan = checks[0]?.plan ?? 'free'

  return (
    <Screen>
      <PageTitle eyebrow="Tu cuenta" title={displayName ?? 'Perfil'} />

      <Card className="mb-4">
        <p className="eyebrow mb-2">Sesión</p>
        <p className="text-sm text-ink-soft">{user.email}</p>
      </Card>

      <Card className="mb-4">
        <div className="mb-5 flex items-baseline justify-between">
          <p className="eyebrow">Plan</p>
          <span className="display text-xl">{PLAN_LABELS[plan]}</span>
        </div>

        <ul className="space-y-4">
          {TRACKED.map((entry, index) => {
            const check = checks[index]
            if (!check) return null
            const pct = check.limit > 0 ? Math.min(100, (check.used / check.limit) * 100) : 0

            return (
              <li key={entry.feature}>
                <div className="mb-1.5 flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-ink-soft">
                    {entry.label}{' '}
                    <span className="text-ink-faint">{entry.period}</span>
                  </span>
                  <span className="tabular-nums">
                    {check.used}
                    <span className="text-ink-faint"> / {check.limit}</span>
                  </span>
                </div>
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-sunken"
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={entry.label}
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <p className="mb-8 px-1 text-xs leading-relaxed text-ink-faint">
        Los límites existen para que el coste no se dispare. Los contadores diarios
        se reinician a medianoche.
      </p>

      <form action={signOut} className="mb-10">
        <Button type="submit" variant="secondary" fullWidth>
          Cerrar sesión
        </Button>
      </form>

      <DeleteAccount email={user.email ?? ''} />
    </Screen>
  )
}
