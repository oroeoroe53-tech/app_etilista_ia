import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { describeGarment } from '@/lib/wardrobe/labels'
import { Screen, PageTitle, EmptyState, Button } from '@/components/ui'

export const metadata = { title: 'Diario · Selyqo' }
export const dynamic = 'force-dynamic'

interface HistoryRow {
  worn_on: string
  clothing_item_id: string
  outfit_id: string | null
}

interface ItemRow {
  id: string
  category: string
  primary_color: string
  fit: string | null
  pattern: string | null
  image_path: string | null
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * Diario de uso.
 *
 * El historial ya se guardaba pero no se veía en ninguna parte. Enseñarlo hace
 * dos cosas: convierte un dato en un recuerdo —"esto me puse el día de la
 * cena"— y anima a seguir registrando, porque un mes lleno da ganas de
 * completarlo.
 *
 * Se maqueta como un calendario de pared: la rejilla del mes, y en cada día que
 * tiene ropa, la miniatura de lo que se llevó.
 */
export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { mes } = await searchParams

  // `mes` viene de la URL: cualquier cosa que no sea AAAA-MM se ignora.
  const today = new Date()
  const parsed = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null
  const year = parsed ? Number(parsed.slice(0, 4)) : today.getFullYear()
  const month = parsed ? Number(parsed.slice(5, 7)) - 1 : today.getMonth()

  const first = new Date(Date.UTC(year, month, 1))
  const next = new Date(Date.UTC(year, month + 1, 1))

  const supabase = await createClient()
  const { data } = await supabase
    .from('wear_history')
    .select('worn_on, clothing_item_id, outfit_id')
    .gte('worn_on', first.toISOString().slice(0, 10))
    .lt('worn_on', next.toISOString().slice(0, 10))
    .order('worn_on', { ascending: true })

  const history = (data ?? []) as unknown as HistoryRow[]

  const itemIds = [...new Set(history.map((h) => h.clothing_item_id))]
  const { data: itemRows } = itemIds.length
    ? await supabase
        .from('clothing_items')
        .select('id, category, primary_color, fit, pattern, image_path')
        .in('id', itemIds)
    : { data: [] }

  const items = new Map(((itemRows ?? []) as unknown as ItemRow[]).map((i) => [i.id, i]))

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    [...items.values()].map((i) => i.image_path).filter((p): p is string => Boolean(p)),
    user.id,
  )

  // Un día puede tener varias prendas: se agrupan y se enseña la primera.
  const byDay = new Map<number, HistoryRow[]>()
  for (const row of history) {
    const day = Number(row.worn_on.slice(8, 10))
    byDay.set(day, [...(byDay.get(day) ?? []), row])
  }

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  // La semana empieza en lunes: getUTCDay() da 0 para domingo.
  const offset = (first.getUTCDay() + 6) % 7

  const prevMonth = new Date(Date.UTC(year, month - 1, 1))
  const nextMonth = new Date(Date.UTC(year, month + 1, 1))
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

  const diasConRopa = byDay.size

  return (
    <Screen>
      <PageTitle eyebrow="Lo que te pusiste" title="Diario" />

      <nav className="mb-6 flex items-center justify-between">
        <Link
          href={`/diario?mes=${monthKey(prevMonth)}`}
          className="px-2 py-1 text-small text-ink-soft"
          aria-label="Mes anterior"
        >
          ←
        </Link>
        <span className="display text-title">
          {MONTHS[month]} {year !== today.getFullYear() ? year : ''}
        </span>
        {isCurrentMonth ? (
          <span aria-hidden className="px-2 py-1 text-small text-ink-faint/30">
            →
          </span>
        ) : (
          <Link
            href={`/diario?mes=${monthKey(nextMonth)}`}
            className="px-2 py-1 text-small text-ink-soft"
            aria-label="Mes siguiente"
          >
            →
          </Link>
        )}
      </nav>

      {history.length === 0 ? (
        <EmptyState
          title="Este mes está en blanco"
          body="Cuando marques un look como puesto, aparecerá aquí. Es lo que me permite no repetirte siempre lo mismo."
          action={
            <Link href="/outfits/que-me-pongo">
              <Button>¿Qué me pongo?</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="mb-2 grid grid-cols-7 gap-1.5 text-center">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
              <li key={i} className="folio pb-1">
                {d}
              </li>
            ))}
          </ul>

          <ul className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: offset }).map((_, i) => (
              <li key={`hueco-${i}`} aria-hidden />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const worn = byDay.get(day)
              const firstItem = worn?.[0] ? items.get(worn[0].clothing_item_id) : null
              const url = firstItem?.image_path ? signed.get(firstItem.image_path) : null
              const outfitId = worn?.[0]?.outfit_id

              const content = (
                <div
                  className={`relative aspect-square overflow-hidden rounded-lg border ${
                    worn ? 'border-line' : 'border-transparent bg-sunken/50'
                  }`}
                >
                  {url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={url}
                      alt={firstItem ? describeGarment(firstItem) : ''}
                      loading="lazy"
                      className="garment-photo h-full w-full object-cover"
                    />
                  ) : null}
                  <span
                    className={`absolute top-0.5 left-1 text-micro tabular-nums ${
                      url ? 'text-white/90 drop-shadow' : 'text-ink-faint'
                    }`}
                  >
                    {day}
                  </span>
                  {worn && worn.length > 1 ? (
                    <span className="absolute right-1 bottom-0.5 text-micro text-white/90 drop-shadow">
                      +{worn.length - 1}
                    </span>
                  ) : null}
                </div>
              )

              return (
                <li key={day}>
                  {outfitId ? (
                    <Link href={`/armario/${worn![0]!.clothing_item_id}`}>{content}</Link>
                  ) : (
                    content
                  )}
                </li>
              )
            })}
          </ul>

          <p className="mt-6 text-center text-small text-ink-soft">
            {diasConRopa === 1
              ? 'Un día registrado este mes.'
              : `${diasConRopa} días registrados este mes.`}
          </p>
        </>
      )}
    </Screen>
  )
}
