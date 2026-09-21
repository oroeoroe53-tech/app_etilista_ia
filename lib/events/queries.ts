import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKETS } from '@/lib/storage/paths'
import { looksLikeToken } from '@/lib/security/link-token'

/**
 * Leer un evento.
 *
 * Aquí el RLS sí sabe quién puede ver qué —`is_event_guest()`— pero los
 * **nombres** y las **fotos** siguen estando del otro lado: `profiles` solo
 * deja leer la fila propia, y el bucket solo deja leer la carpeta propia. Por
 * eso se usa el service role, y por eso lo primero que hace cada función de
 * este archivo es comprobar que quien pregunta es del evento.
 */

export interface EventGuestView {
  userId: string
  name: string
  note: string | null
  color: string | null
  photoUrl: string | null
  isMe: boolean
}

export interface EventView {
  id: string
  title: string
  heldOn: string
  place: string | null
  token: string
  ownerId: string
  isOwner: boolean
  guests: EventGuestView[]
  me: EventGuestView | null
}

const ANON = 'Alguien'
const PHOTO_EXPIRY_SECONDS = 1800

interface GuestRow {
  user_id: string
  outfit_note: string | null
  outfit_color: string | null
  photo_path: string | null
}

/** Devuelve `null` si quien pregunta no es del evento. No distingue el motivo. */
export async function getEvent(eventId: string, viewerId: string): Promise<EventView | null> {
  const supabase = createAdminClient()

  const { data: eventData } = await supabase
    .from('events')
    .select('id, owner_id, title, held_on, place, token, expires_at')
    .eq('id', eventId)
    .maybeSingle()

  if (!eventData) return null
  const event = eventData as {
    id: string
    owner_id: string
    title: string
    held_on: string
    place: string | null
    token: string
    expires_at: string
  }

  if (new Date(event.expires_at).getTime() <= Date.now()) return null

  const { data: guestData } = await supabase
    .from('event_guests')
    .select('user_id, outfit_note, outfit_color, photo_path')
    .eq('event_id', event.id)
    .order('joined_at')

  const guests = (guestData ?? []) as GuestRow[]

  // La comprobación que sustituye a RLS: o eres invitada, o organizas.
  const belongs = event.owner_id === viewerId || guests.some((g) => g.user_id === viewerId)
  if (!belongs) return null

  const ids = [...new Set([event.owner_id, ...guests.map((g) => g.user_id)])]

  const [{ data: profiles }, signed] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', ids),
    supabase.storage
      .from(BUCKETS.eventPhotos)
      .createSignedUrls(
        guests.map((g) => g.photo_path).filter((p): p is string => Boolean(p)),
        PHOTO_EXPIRY_SECONDS,
      ),
  ])

  const names = new Map<string, string>()
  for (const row of (profiles ?? []) as { id: string; display_name: string | null }[]) {
    names.set(row.id, row.display_name?.trim() || ANON)
  }

  const urls = new Map<string, string>()
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }

  const views: EventGuestView[] = guests.map((guest) => ({
    userId: guest.user_id,
    name: names.get(guest.user_id) ?? ANON,
    note: guest.outfit_note,
    color: guest.outfit_color,
    photoUrl: guest.photo_path ? (urls.get(guest.photo_path) ?? null) : null,
    isMe: guest.user_id === viewerId,
  }))

  return {
    id: event.id,
    title: event.title,
    heldOn: event.held_on,
    place: event.place,
    token: event.token,
    ownerId: event.owner_id,
    isOwner: event.owner_id === viewerId,
    guests: views,
    me: views.find((g) => g.isMe) ?? null,
  }
}

export interface EventSummary {
  id: string
  title: string
  heldOn: string
  place: string | null
  guests: number
  /** Todavía no has dicho de qué vas. */
  pendingOutfit: boolean
}

/** Los eventos a los que va alguien, próximos primero. */
export async function listMyEvents(userId: string): Promise<EventSummary[]> {
  const supabase = createAdminClient()

  const { data: mine } = await supabase
    .from('event_guests')
    .select('event_id, outfit_note, outfit_color, photo_path')
    .eq('user_id', userId)

  const rows = (mine ?? []) as (GuestRow & { event_id: string })[]

  // Quien organiza también ve su evento aunque no se haya apuntado todavía.
  const { data: owned } = await supabase
    .from('events')
    .select('id')
    .eq('owner_id', userId)
    .gt('expires_at', new Date().toISOString())

  const ids = [
    ...new Set([...rows.map((r) => r.event_id), ...((owned ?? []) as { id: string }[]).map((e) => e.id)]),
  ]
  if (ids.length === 0) return []

  const { data: events } = await supabase
    .from('events')
    .select('id, title, held_on, place, expires_at, event_guests(id)')
    .in('id', ids)
    .gt('expires_at', new Date().toISOString())
    .order('held_on', { ascending: true })

  type Row = {
    id: string
    title: string
    held_on: string
    place: string | null
    event_guests: unknown[]
  }

  return ((events ?? []) as Row[]).map((event) => {
    const me = rows.find((r) => r.event_id === event.id)
    return {
      id: event.id,
      title: event.title,
      heldOn: event.held_on,
      place: event.place,
      guests: event.event_guests?.length ?? 0,
      pendingOutfit: !me || (!me.outfit_note && !me.outfit_color && !me.photo_path),
    }
  })
}

export interface EventInvite {
  eventId: string
  title: string
  heldOn: string
  place: string | null
  ownerName: string
  state: 'open' | 'expired' | 'already'
}

/** Leer una invitación a un evento desde su enlace. */
export async function loadEventInvite(
  token: string,
  viewerId: string | null,
): Promise<EventInvite | null> {
  if (!looksLikeToken(token)) return null

  const supabase = createAdminClient()

  const { data } = await supabase
    .from('events')
    .select('id, owner_id, title, held_on, place, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!data) return null
  const event = data as {
    id: string
    owner_id: string
    title: string
    held_on: string
    place: string | null
    expires_at: string
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', event.owner_id)
    .maybeSingle()

  let state: EventInvite['state'] = 'open'
  if (new Date(event.expires_at).getTime() <= Date.now()) state = 'expired'
  else if (viewerId) {
    if (viewerId === event.owner_id) state = 'already'
    else {
      const { data: guest } = await supabase
        .from('event_guests')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', viewerId)
        .maybeSingle()
      if (guest) state = 'already'
    }
  }

  return {
    eventId: event.id,
    title: event.title,
    heldOn: event.held_on,
    place: event.place,
    ownerName:
      (profile as { display_name: string | null } | null)?.display_name?.trim() || ANON,
    state,
  }
}
