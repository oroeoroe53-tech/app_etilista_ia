import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { Screen, PageTitle, EmptyState, Button, Card } from '@/components/ui'

export const dynamic = 'force-dynamic'

interface OutfitRow {
  id: string
  created_at: string
  explanation: string | null
  context: { request_id?: string; occasion?: string | null; temperature_c?: number | null } | null
}

export default async function OutfitsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: recent }, { count: itemCount }] = await Promise.all([
    supabase
      .from('outfits')
      .select('id, created_at, explanation, context')
      .eq('source', 'engine')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('clothing_items')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null),
  ])

  const rows = (recent ?? []) as unknown as OutfitRow[]

  // Las propuestas se guardan de tres en tres con un mismo `request_id`.
  // Aquí se enseña una entrada por petición, no tres filas sueltas.
  const requests = new Map<string, OutfitRow>()
  for (const row of rows) {
    const id = row.context?.request_id
    if (id && !requests.has(id)) requests.set(id, row)
  }

  return (
    <Screen>
      <PageTitle eyebrow="Descubre" title="Outfits" />

      <Link href="/outfits/que-me-pongo" className="mb-3 block">
        <Card className="bg-accent text-accent-ink">
          <p className="eyebrow mb-2 text-accent-ink/60">Ahora mismo</p>
          <span className="display block text-2xl">¿Qué me pongo?</span>
          <span className="mt-1 block text-sm opacity-70">
            Dime la ocasión y te propongo tres opciones.
          </span>
        </Card>
      </Link>

      <Link href="/outfits/swipe" className="mb-3 block">
        <Card>
          <p className="eyebrow mb-2">Sin prisa</p>
          <span className="display block text-2xl">¿Te pondrías esto?</span>
          <span className="mt-1 block text-sm text-ink-soft">
            Valora combinaciones y aprendo qué va contigo.
          </span>
        </Card>
      </Link>

      <Link href="/outfits/maleta" className="mb-8 block">
        <Card>
          <p className="eyebrow mb-2">Viajes</p>
          <span className="display block text-2xl">La maleta</span>
          <span className="mt-1 block text-sm text-ink-soft">
            Qué meter para tres días fuera, sin llevar de más.
          </span>
        </Card>
      </Link>

      {(itemCount ?? 0) === 0 ? (
        <EmptyState
          title="Aún no hay nada que enseñarte"
          body="Cuando tengas prendas en el armario podré proponerte combinaciones."
          action={
            <Link href="/onboarding">
              <Button>Enséñame cómo vistes</Button>
            </Link>
          }
        />
      ) : requests.size === 0 ? (
        <p className="py-10 text-center text-sm leading-relaxed text-ink-soft">
          Todavía no te he propuesto nada. Pulsa arriba y vemos qué te pones.
        </p>
      ) : (
        <section>
          <h2 className="eyebrow mb-4">Antes te propuse</h2>
          <ul className="space-y-3">
            {[...requests.entries()].map(([requestId, row]) => (
              <li key={requestId}>
                <Link
                  href={`/outfits/propuesta/${requestId}`}
                  className="block rounded-2xl border border-line bg-raised px-5 py-4"
                >
                  <p className="text-sm text-ink">
                    {formatDate(row.created_at)}
                    {row.context?.temperature_c != null
                      ? ` · ${row.context.temperature_c}°`
                      : ''}
                  </p>
                  {row.explanation ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                      {row.explanation}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) {
    return `Hoy, ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
  }
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
}
