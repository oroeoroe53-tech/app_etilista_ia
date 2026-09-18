import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { Screen, PageTitle, EmptyState, Button } from '@/components/ui'

/**
 * Armario — Fase 3.
 *
 * En la Fase 1 la pantalla ya lee el armario real: así, en cuanto el onboarding
 * empiece a crear prendas, esto deja de estar vacío solo. La cuadrícula, los
 * filtros y la edición llegan en su fase.
 */
export default async function WardrobePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data } = await supabase
    .from('clothing_items')
    .select('id, category, primary_color')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(60)

  const items = (data ?? []) as Array<{ id: string; category: string; primary_color: string }>

  return (
    <Screen>
      <PageTitle eyebrow="Lo que tienes" title="Armario" />

      {items.length === 0 ? (
        <EmptyState
          title="Todavía está vacío"
          body="Sube unas cuantas fotos de looks que ya lleves y crearé tu armario a partir de ellas."
          action={
            <Link href="/onboarding">
              <Button>Enséñame cómo vistes</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="aspect-3/4 rounded-2xl border border-line bg-sunken p-3 text-xs text-ink-soft"
            >
              {item.category}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
