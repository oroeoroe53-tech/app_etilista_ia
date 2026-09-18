import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { getPlan } from '@/lib/subscriptions/entitlements'
import { ONBOARDING_PHOTOS } from '@/lib/subscriptions/plans'
import { PhotoUploader } from '@/components/onboarding/PhotoUploader'

export const metadata = { title: 'Enséñame cómo vistes · Estilista' }
export const dynamic = 'force-dynamic'

/**
 * Onboarding: la primera experiencia del producto.
 *
 * No se pide fotografiar prenda a prenda —eso es trabajo y nadie lo hace—, se
 * pide enseñar looks que ya se llevan (PLAN.md §11).
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Si ya hay fotos esperando o procesándose, el sitio es la pantalla de espera.
  const { count: enCurso } = await supabase
    .from('outfit_photos')
    .select('id', { count: 'exact', head: true })
    .in('analysis_status', ['pending', 'processing'])

  if ((enCurso ?? 0) > 0) redirect('/onboarding/analizando')

  const plan = await getPlan(user.id)
  const { min, max } = ONBOARDING_PHOTOS[plan]

  return (
    <main className="mx-auto w-full max-w-sm px-6 pt-safe pb-12">
      <header className="pt-12 pb-8">
        <p className="eyebrow mb-4">Primer paso</p>
        <h1 className="display mb-5 text-4xl leading-tight">
          Enséñame
          <br />
          cómo vistes
        </h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          Sube entre {min} y {max} fotos de looks que ya hayas llevado. Valen las del
          espejo, las de un viaje o las de hace dos años. No tienen que ser buenas fotos.
        </p>
      </header>

      <PhotoUploader min={min} max={max} />

      <ul className="mt-10 space-y-3 text-sm text-ink-soft">
        <Point>Identificaré las prendas que aparecen.</Point>
        <Point>Agruparé las que se repitan entre fotos.</Point>
        <Point>Con eso montaré tu armario inicial.</Point>
      </ul>

      <p className="mt-8 text-xs leading-relaxed text-ink-faint">
        Tus fotos son privadas. No se comparten con nadie y puedes borrarlas cuando
        quieras.
      </p>

      <Link
        href="/"
        className="mt-8 block text-center text-sm text-ink-soft underline underline-offset-4"
      >
        Ahora no
      </Link>
    </main>
  )
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
      {children}
    </li>
  )
}
