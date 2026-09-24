import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { TripForm } from '@/components/outfits/TripForm'
import { Screen, EmptyState, Button } from '@/components/ui'

export const metadata = { title: 'La maleta · Selyqo' }
export const dynamic = 'force-dynamic'

export default async function TripPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { count } = await supabase
    .from('clothing_items')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)

  if ((count ?? 0) < 5) {
    return (
      <Screen>
        <header className="pt-8 pb-6">
          <p className="eyebrow mb-2">Viajes</p>
          <h1 className="display text-[2rem]">La maleta</h1>
        </header>
        <EmptyState
          title="Me falta armario"
          body="Con tan pocas prendas no puedo repartir looks entre varios días. Añade unas cuantas más."
          action={
            <Link href="/armario/nueva">
              <Button>Añadir prendas</Button>
            </Link>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <header className="pt-8 pb-8">
        <p className="eyebrow mb-2">Viajes</p>
        <h1 className="display text-[2rem]">La maleta</h1>
        <p className="mt-3 text-small leading-relaxed text-ink-soft">
          Dime adónde vas y cuántos días. Te digo qué meter y qué te pones cada día.
        </p>
      </header>

      <TripForm />
    </Screen>
  )
}
