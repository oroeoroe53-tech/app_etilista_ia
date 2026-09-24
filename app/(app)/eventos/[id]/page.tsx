import { notFound, redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { getEvent } from '@/lib/events/queries'
import { formatEventDate } from '@/lib/events/format'
import { findClashes, clashMessage, freeColors } from '@/lib/events/clash'
import { colorLabel } from '@/lib/wardrobe/labels'
import { COLOR_SWATCHES } from '@/lib/style/describe'
import { leaveEvent, deleteEvent } from '../actions'
import { OutfitDeclare } from '@/components/events/OutfitDeclare'
import { InviteGuests } from '@/components/events/InviteGuests'
import { BackLink, Notice, PhotoSlot } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Un evento: quién va y de qué.
 *
 * El aviso de coincidencias va **arriba del todo**, antes que la lista. Es lo
 * único que esta pantalla hace y que no haga ya un grupo de mensajería: poner
 * cuatro fotos en fila lo hace cualquiera; decir «Marta y tú vais de verde» es
 * a lo que se viene.
 */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const supabase = await createClient()
  const event = await getEvent(id, user.id)

  // Sin acceso y «no existe» se responden igual.
  if (!event) notFound()

  const myName = event.me?.name ?? null
  const guestColors = event.guests.map((g) => ({ name: g.name, color: g.color }))
  const clashes = findClashes(guestColors)

  /*
   * Los colores que te quedan libres.
   *
   * Solo se calculan si de verdad hay un choque contigo: sugerir alternativas a
   * quien no está chocando con nadie es ruido. Y salen de tu armario, no de la
   * paleta entera, porque «ve de teja» a quien no tiene nada teja no es un
   * consejo.
   */
  const iClash = clashes.some((clash) => myName && clash.names.includes(myName))

  const { data: myGarments } = iClash
    ? await supabase
        .from('clothing_items')
        .select('primary_color')
        .is('deleted_at', null)
        .eq('is_available', true)
    : { data: null }

  const free = iClash
    ? freeColors(
        guestColors,
        ((myGarments ?? []) as { primary_color: string }[]).map((g) => g.primary_color),
      )
    : []
  const pending = event.guests.filter((g) => !g.color && !g.note && !g.photoUrl)

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/eventos">eventos</BackLink>

      <header className="pt-2 pb-6">
        <p className="eyebrow mb-2.5">
          {formatEventDate(event.heldOn)}
          {event.place ? ` · ${event.place}` : ''}
        </p>
        <h1 className="display text-display leading-[1.06]">{event.title}</h1>
      </header>

      {/* --- Lo único que importa de verdad ---------------------------------- */}
      {clashes.length > 0 ? (
        <div className="mb-7 space-y-2">
          {clashes.map((clash) => (
            <Notice key={clash.color}>{clashMessage(clash, myName)}</Notice>
          ))}

          {/*
            La salida, no solo el problema.

            Un aviso que dice «vais iguales» y ahí se queda deja el trabajo a
            medias: lo que hace falta a esa hora es saber por dónde salir, y con
            ropa que se tenga en casa.
          */}
          {free.length > 0 ? (
            <p className="px-4 text-micro leading-[1.6] text-ink-faint">
              Nadie va de{' '}
              {free.map((color) => colorLabel(color).toLowerCase()).join(', ')}, y
              tú tienes.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --- Quién va -------------------------------------------------------- */}
      <p className="eyebrow mb-3">
        Quién va · {event.guests.length}
      </p>

      <ul className="grid grid-cols-2 gap-2.5">
        {event.guests.map((guest) => (
          <li key={guest.userId}>
            <PhotoSlot
              src={guest.photoUrl}
              label={guest.note ?? guest.name}
              className="aspect-[3/4] rounded-[var(--radius-card)]"
            />
            <p className="mt-1.5 truncate text-small">
              {guest.isMe ? 'Tú' : guest.name}
            </p>
            <p className="mono mt-0.5 flex items-center gap-1.5 truncate text-ink-faint">
              {guest.color ? (
                <>
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-[rgba(21,20,15,.12)]"
                    style={{ background: COLOR_SWATCHES[guest.color] }}
                  />
                  {colorLabel(guest.color).toLowerCase()}
                </>
              ) : guest.note ? (
                guest.note
              ) : (
                'no ha dicho nada'
              )}
            </p>
          </li>
        ))}
      </ul>

      {pending.length === 1 && pending[0] ? (
        <p className="mt-4 text-micro leading-[1.5] text-ink-faint">
          Falta que {pending[0].isMe ? 'tú digas' : `${pending[0].name} diga`} de qué va.
        </p>
      ) : pending.length > 1 ? (
        <p className="mt-4 text-micro leading-[1.5] text-ink-faint">
          Faltan {pending.length} por decir de qué van.
        </p>
      ) : null}

      {/* --- Lo tuyo --------------------------------------------------------- */}
      {event.me ? (
        <section className="mt-9 border-t border-line pt-7">
          <OutfitDeclare
            eventId={event.id}
            note={event.me.note}
            color={event.me.color}
            photoUrl={event.me.photoUrl}
          />
        </section>
      ) : null}

      {/* --- Organizar ------------------------------------------------------- */}
      <section className="mt-9 border-t border-line pt-7">
        {event.isOwner ? <InviteGuests eventId={event.id} /> : null}

        <form action={event.isOwner ? deleteEvent : leaveEvent} className="mt-4">
          <input type="hidden" name="eventId" value={event.id} />
          <button
            type="submit"
            className="w-full py-2 text-center text-small text-ink-faint underline underline-offset-4"
          >
            {event.isOwner ? 'Cancelar el evento' : 'Salirme del evento'}
          </button>
        </form>
      </section>

      <p className="mt-9 border-t border-line pt-6 text-micro leading-[1.6] text-ink-faint">
        Lo que se sube aquí solo lo ven quienes están en este evento, y se borra
        entero —fotos incluidas— una semana después del día señalado.
      </p>
    </div>
  )
}
