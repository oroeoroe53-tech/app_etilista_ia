import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listFeed, type FeedEntry } from '@/lib/feed/queries'
import { unshareDailyLook } from '../actions'
import { BackLink, EmptyState, PhotoSlot } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Lo que se pone la gente · Estilista' }

/**
 * El feed del círculo.
 *
 * Qué NO es, que es lo que lo hace soportable:
 *
 *  · **No hay desconocidos.** Solo la gente de tu círculo.
 *  · **No hay «me gusta», ni contadores, ni orden por interés.** Por fecha, y
 *    se acaba. Una pantalla que se termina es lo contrario de lo que hacen las
 *    aplicaciones que no queremos que esta sea.
 *  · **No hay nada que ganar publicando.** Un look al día, o ninguno.
 *
 * Lo único que se puede hacer con lo que ves es pedir una prenda prestada —
 * cuando esa persona te deja ver su armario— porque es la única acción que
 * cambia algo en la vida real de alguien.
 */
export default async function FeedPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const entries = await listFeed(user.id)

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/social">social</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Inspiración</p>
        <h1 className="display text-[31px] leading-[1.06]">
          Lo que se pone
          <span className="display-italic block">tu gente</span>
        </h1>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          title="Todavía nadie"
          body="Cuando alguien de tu círculo enseñe lo que se ha puesto, saldrá aquí. Puedes empezar tú desde la portada."
        />
      ) : (
        <ul className="space-y-7">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Entry entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Entry({ entry }: { entry: FeedEntry }) {
  const [first, ...rest] = entry.garments

  return (
    <article>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span
          aria-hidden
          className="display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-[14px]"
        >
          {entry.name.trim().charAt(0).toUpperCase()}
        </span>
        <p className="min-w-0 flex-1 truncate text-[12.5px]">
          <span className="font-medium">{entry.name}</span>
          <span className="text-ink-soft">
            {' · '}
            {relativeDay(entry.sharedOn)}
          </span>
        </p>

        {entry.isMine ? (
          <form action={unshareDailyLook}>
            <input type="hidden" name="shareId" value={entry.id} />
            <button type="submit" className="shrink-0 py-1 text-[10.5px] text-ink-faint">
              quitar
            </button>
          </form>
        ) : null}
      </div>

      <div className="flex h-[210px] gap-1.5">
        <PhotoSlot
          src={first?.imageUrl ?? null}
          label={first?.label ?? ''}
          showLabel={false}
          className="min-w-0 flex-[1.4] rounded-[22px]"
        />
        {rest.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {rest.slice(0, 3).map((garment) => (
              <PhotoSlot
                key={garment.id}
                src={garment.imageUrl}
                label={garment.label}
                showLabel={false}
                className="min-h-0 flex-1 rounded-[22px]"
              />
            ))}
          </div>
        ) : null}
      </div>

      {entry.lookName ? <p className="display mt-3 text-[21px]">{entry.lookName}</p> : null}
      {entry.note ? (
        <p className="mt-1.5 text-[12px] leading-[1.5]">«{entry.note}»</p>
      ) : entry.why ? (
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink-soft">{entry.why}</p>
      ) : null}

      {/*
        Lo único accionable del feed, y solo cuando de verdad se puede: si esa
        persona no te deja ver su armario, un botón de pedir sería una promesa
        que acaba en una puerta cerrada.
      */}
      {!entry.isMine && entry.canBorrow ? (
        <Link
          href={`/armario/de/${entry.userId}`}
          className="mono mt-2.5 inline-block text-ink-soft underline underline-offset-4"
        >
          pedirle algo de este look →
        </Link>
      ) : null}
    </article>
  )
}

/** «hoy», «ayer», o el día. Nadie quiere leer una fecha completa en un feed. */
function relativeDay(iso: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (iso === today) return 'hoy'

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (iso === yesterday) return 'ayer'

  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
  })
}
