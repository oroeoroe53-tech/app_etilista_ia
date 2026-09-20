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
    <main
      className="mx-auto w-full max-w-[30rem] pt-safe pb-12"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="pt-12 pb-7">
        <p className="eyebrow mb-3">Primer paso</p>
        <h1 className="display mb-4 text-[33px] leading-[1.05]">
          Enséñame
          <span className="display-italic block">cómo vistes</span>
        </h1>
        <p className="text-[11.5px] leading-[1.5] text-ink-soft">
          Sube entre {min} y {max} fotos de looks que ya hayas llevado. Valen las del
          espejo, las de un viaje o las de hace dos años. No tienen que ser buenas fotos.
        </p>
      </header>

      <PhotoUploader min={min} max={max} />

      <ul className="mt-9 space-y-2.5 text-[11.5px] leading-[1.5] text-ink-soft">
        <Point>Identificaré las prendas que aparecen.</Point>
        <Point>Agruparé las que se repitan entre fotos.</Point>
        <Point>Con eso montaré tu armario inicial.</Point>
      </ul>

      {/*
        El momento exacto en el que alguien duda. Decirle aquí que las fotos se
        borran solas vale más que decírselo en cualquier otra pantalla.
      */}
      <p className="mt-7 text-[10.5px] leading-[1.6] text-ink-faint">
        Tus fotos son privadas y no se comparten con nadie. En cuanto termino de
        leerlas, <span className="text-ink-soft">el original se borra solo</span>:
        me quedo con el recorte de cada prenda, no con la foto.{' '}
        <Link href="/privacidad" className="underline underline-offset-4">
          Cómo funciona
        </Link>
      </p>

      <Link
        href="/"
        className="mt-7 block text-center text-[11.5px] text-ink-soft underline underline-offset-4"
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
