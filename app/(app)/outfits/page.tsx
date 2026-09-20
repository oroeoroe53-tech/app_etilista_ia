import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { Screen, PageTitle, EmptyState, Button, PhotoSlot, QuietRow } from '@/components/ui'

export const dynamic = 'force-dynamic'

interface OutfitRow {
  id: string
  created_at: string
  explanation: string | null
  context: {
    request_id?: string
    title?: string
    daily_on?: string | null
    occasion?: string | null
    temperature_c?: number | null
  } | null
}

/** Cuántas peticiones anteriores se enseñan. Más abajo nadie baja. */
const HISTORY = 8

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
      .limit(40),
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
    // El look de la portada también es una fila de `outfits`, pero no lo pediste
    // tú: se compone solo cada mañana. En un historial de peticiones sobra.
    if (row.context?.daily_on) continue
    const id = row.context?.request_id
    if (id && !requests.has(id)) requests.set(id, row)
  }

  const history = [...requests.entries()].slice(0, HISTORY)

  /*
   * Una miniatura por entrada. Se pide la primera prenda de cada look de la
   * lista en una sola consulta: sin foto, el historial es una lista de fechas.
   */
  const thumbs = await firstPhotos(
    supabase,
    history.map(([, row]) => row.id),
  )

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    [...thumbs.values()].filter((p): p is string => Boolean(p)),
    user.id,
  )

  return (
    <Screen>
      <PageTitle eyebrow="Dos maneras de pedirme ropa" title="Outfits" />

      <Link href="/outfits/que-me-pongo" className="block">
        <div className="rounded-[24px] bg-accent p-5 text-accent-ink">
          <p className="eyebrow text-accent-ink/55">Ahora mismo</p>
          <p className="display mt-2 text-[26px]">¿Qué me pongo?</p>
          <p className="mt-2 text-[11.5px] leading-[1.5] opacity-70">
            Dime la ocasión y el tiempo. Yo pongo el resto.
          </p>
        </div>
      </Link>

      <Link href="/outfits/swipe" className="mt-3.5 block">
        <div className="rounded-[24px] border border-line p-5">
          <p className="eyebrow">Sin prisa</p>
          <p className="display mt-2 text-[26px]">¿Te pondrías esto?</p>
          <p className="mt-2 text-[11.5px] leading-[1.5] text-ink-soft">
            Valora combinaciones y aprendo qué va contigo.
          </p>
        </div>
      </Link>

      {/*
        La maleta y el diario no están en el rediseño —la maleta queda fuera de
        su alcance a propósito— pero son las dos únicas puertas que tienen. Van
        en filas finas: presentes sin competir con las dos tarjetas de arriba.
      */}
      <nav className="mt-6">
        <QuietRow href="/outfits/maleta" title="La maleta">
          Qué meter para un viaje
        </QuietRow>
        <QuietRow href="/diario" title="Diario">
          Lo que te has ido poniendo
        </QuietRow>
      </nav>

      {(itemCount ?? 0) === 0 ? (
        <EmptyState
          title="Aún no hay nada que enseñarte"
          body="Cuando tengas prendas en el armario podré proponerte combinaciones."
          action={
            <Link href="/onboarding" className="block">
              <Button fullWidth>Enséñame cómo vistes</Button>
            </Link>
          }
        />
      ) : history.length === 0 ? (
        <p className="py-10 text-center text-[11.5px] leading-[1.5] text-ink-soft">
          Todavía no te he propuesto nada. Pulsa arriba y vemos qué te pones.
        </p>
      ) : (
        <section className="mt-8">
          <h2 className="eyebrow mb-1">Antes te propuse</h2>
          <ul>
            {history.map(([requestId, row]) => {
              const path = thumbs.get(row.id)
              const url = path ? (signed.get(path) ?? null) : null
              return (
                <li key={requestId}>
                  <Link
                    href={`/outfits/propuesta/${requestId}`}
                    className="flex items-center gap-3.5 border-b border-line py-3"
                  >
                    <PhotoSlot
                      src={url}
                      label={row.context?.title ?? 'look'}
                      showLabel={false}
                      className="h-16 w-[52px] shrink-0 rounded-[10px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">
                        {formatDate(row.created_at)}
                        {row.context?.temperature_c != null
                          ? ` · ${Math.round(row.context.temperature_c)}°`
                          : ''}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-soft">
                        {row.context?.title ?? row.explanation ?? 'Tres opciones'}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-[13px] text-ink-faint">
                      →
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </Screen>
  )
}

/** La primera foto de cada look, en una sola consulta para toda la lista. */
async function firstPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  outfitIds: readonly string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  if (outfitIds.length === 0) return result

  const { data: links } = await supabase
    .from('outfit_items')
    .select('outfit_id, clothing_item_id')
    .in('outfit_id', outfitIds as string[])

  const pairs = (links ?? []) as Array<{ outfit_id: string; clothing_item_id: string }>
  if (pairs.length === 0) return result

  const { data: items } = await supabase
    .from('clothing_items')
    .select('id, image_path')
    .in('id', [...new Set(pairs.map((p) => p.clothing_item_id))])
    .not('image_path', 'is', null)

  const byItem = new Map(
    ((items ?? []) as Array<{ id: string; image_path: string | null }>).map((i) => [
      i.id,
      i.image_path,
    ]),
  )

  for (const pair of pairs) {
    if (result.get(pair.outfit_id)) continue
    const path = byItem.get(pair.clothing_item_id)
    if (path) result.set(pair.outfit_id, path)
  }

  return result
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
