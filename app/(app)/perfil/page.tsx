import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { Screen, PageTitle, Card, Button } from '@/components/ui'
import { PLAN_LABELS, PLAN_LIMITS, type PlanId } from '@/lib/subscriptions/plans'
import { signOut } from '@/app/(auth)/actions'

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle()

  const plan = (((data as { plan?: string } | null)?.plan ?? 'free') as PlanId)
  const limits = PLAN_LIMITS[plan]

  return (
    <Screen>
      <PageTitle eyebrow="Tu cuenta" title="Perfil" />

      <Card className="mb-4">
        <p className="eyebrow mb-2">Sesión</p>
        <p className="text-sm text-ink-soft">{user.email}</p>
      </Card>

      <Card className="mb-4">
        <div className="mb-4 flex items-baseline justify-between">
          <p className="eyebrow">Plan</p>
          <span className="display text-xl">{PLAN_LABELS[plan]}</span>
        </div>
        <dl className="space-y-2 text-sm">
          <Row label="Prendas en el armario" value={limits.add_clothing_item} />
          <Row label="Análisis de fotos al mes" value={limits.analyze_outfit} />
          <Row label="Propuestas al día" value={limits.request_outfits} />
        </dl>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="secondary" fullWidth>
          Cerrar sesión
        </Button>
      </form>
    </Screen>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
