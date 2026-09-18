import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { Button } from '@/components/ui'
import { ONBOARDING_PHOTOS } from '@/lib/subscriptions/plans'

export const metadata = { title: 'Enséñame cómo vistes · Estilista' }

/** Lee la sesión: no hay nada que prerenderizar. */
export const dynamic = 'force-dynamic'

/**
 * Onboarding — Fase 2.
 *
 * La pantalla de bienvenida ya está escrita porque define el tono del producto
 * (PLAN.md §11): no se pide fotografiar prenda a prenda, se pide enseñar looks
 * que ya se llevan. La subida y el análisis llegan en la Fase 2.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { min, max } = ONBOARDING_PHOTOS.free

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pt-safe">
      <div className="flex flex-1 flex-col justify-center py-16">
        <p className="eyebrow mb-4">Primer paso</p>
        <h1 className="display mb-5 text-4xl leading-tight">
          Enséñame
          <br />
          cómo vistes
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-ink-soft">
          Sube entre {min} y {max} fotos de looks que ya hayas llevado. Valen las del
          espejo, las de un viaje o las de hace dos años. No tienen que ser buenas fotos.
        </p>

        <ul className="mb-10 space-y-3 text-sm text-ink-soft">
          <Point>Identificaré las prendas que aparecen.</Point>
          <Point>Agruparé las que se repitan entre fotos.</Point>
          <Point>Con eso montaré tu armario inicial.</Point>
        </ul>

        <Button size="lg" fullWidth disabled>
          Elegir fotos
        </Button>
        <p className="mt-3 text-center text-xs text-ink-faint">
          La subida se activa en la siguiente fase del desarrollo.
        </p>

        <Link href="/" className="mt-8 text-center text-sm text-ink-soft underline underline-offset-4">
          Ahora no
        </Link>
      </div>
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
