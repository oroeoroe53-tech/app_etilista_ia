import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { Screen, Card } from '@/components/ui'

/**
 * Inicio.
 *
 * La acción principal —"¿Qué me pongo?"— tiene que estar siempre a la vista
 * (PLAN.md §23). El resto de la pantalla es contexto, no competencia.
 *
 * Fase 1: la pantalla existe y lee el estado real del usuario. El motor que
 * responde a la pregunta llega en la Fase 6.
 */
export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: profile }, { count: itemCount }] = await Promise.all([
    supabase.from('profiles').select('display_name, onboarding_stage').eq('id', user.id).maybeSingle(),
    supabase
      .from('clothing_items')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null),
  ])

  const row = profile as { display_name?: string | null; onboarding_stage?: string } | null
  const name = row?.display_name ?? 'Hola'
  const onboardingDone = row?.onboarding_stage === 'completed'
  const prendas = itemCount ?? 0

  return (
    <Screen>
      <header className="pt-10 pb-8">
        <p className="eyebrow mb-2">Tu estilista</p>
        <h1 className="display text-5xl">{name}</h1>
      </header>

      {!onboardingDone ? (
        <Card className="mb-6">
          <p className="eyebrow mb-3">Primer paso</p>
          <h2 className="display mb-2 text-2xl">Enséñame cómo vistes</h2>
          <p className="mb-5 text-sm leading-relaxed text-ink-soft">
            Sube cinco o seis fotos de looks que ya hayas llevado. No hace falta que sean
            buenas fotos: valen las del espejo, las de vacaciones o las antiguas.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink"
          >
            Empezar
          </Link>
        </Card>
      ) : null}

      <Link
        href="/outfits/que-me-pongo"
        className="group mb-6 block rounded-[var(--radius-card)] bg-accent p-6 text-accent-ink"
      >
        <p className="eyebrow mb-3 text-accent-ink/60">Ahora mismo</p>
        <span className="display block text-3xl">¿Qué me pongo?</span>
        <span className="mt-2 block text-sm opacity-70">
          Dime la ocasión y el tiempo, y te propongo varios looks.
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/armario" className="rounded-[var(--radius-card)] border border-line bg-raised p-5">
          <span className="display block text-3xl">{prendas}</span>
          <span className="mt-1 block text-sm text-ink-soft">
            {prendas === 1 ? 'prenda' : 'prendas'} en tu armario
          </span>
        </Link>
        <Link href="/outfits" className="rounded-[var(--radius-card)] border border-line bg-raised p-5">
          <span className="display block text-3xl">Descubre</span>
          <span className="mt-1 block text-sm text-ink-soft">
            Desliza y enséñame qué te gusta
          </span>
        </Link>
      </div>
    </Screen>
  )
}
