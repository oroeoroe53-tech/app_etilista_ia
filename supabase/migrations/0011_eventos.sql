-- ===========================================================================
-- 0011 — Eventos: no ir iguales
--
-- Una boda, un festival, una cena de grupo o Nochevieja. Se crea el evento, se
-- invita, y cada quien dice qué piensa ponerse.
--
-- A diferencia del armario compartido, aquí **sí** se usa RLS para dejar que
-- unas personas vean cosas de otras, y se puede sin miedo por una razón
-- concreta: estas tablas son nuevas. No hay ninguna consulta escrita antes que
-- dé por hecho que solo devuelven lo propio, que es exactamente lo que hacía
-- peligroso abrir `clothing_items` (ver `0010_prestamos.sql`).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,

  title       text not null check (char_length(title) between 1 and 80),
  -- Solo el día. La hora no cambia lo que te pones y es un campo más que
  -- rellenar con el móvil en la mano.
  held_on     date not null,
  place       text check (place is null or char_length(place) <= 80),

  token       text not null unique check (char_length(token) between 8 and 24),

  /*
   * Cuándo se borra todo, fotos incluidas.
   *
   * Una semana después del evento. Las fotos de un evento las ven todas las
   * invitadas, o sea que han salido del control de quien las subió, igual que
   * en una votación; y una semana después de la boda ya no le sirven a nadie.
   * Lo que caduca no se puede filtrar.
   */
  expires_at  timestamptz not null,

  created_at  timestamptz not null default now()
);

create index events_owner_idx  on public.events (owner_id, held_on desc);
create index events_expiry_idx on public.events (expires_at);


-- ---------------------------------------------------------------------------
-- event_guests — quién va, y de qué
-- ---------------------------------------------------------------------------

create table public.event_guests (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- Lo que piensa ponerse, en sus palabras: «el vestido verde largo».
  outfit_note   text check (outfit_note is null or char_length(outfit_note) <= 120),

  /*
   * El color principal, de la misma taxonomía que el armario.
   *
   * Es el único dato estructurado de aquí, y existe por una razón práctica: es
   * lo que permite avisar de verdad —«Marta y tú vais de verde»— en vez de
   * poner las fotos en una rejilla y dejar que cada una compare a ojo, que es
   * justo lo que ya hace un grupo de WhatsApp.
   */
  outfit_color  text,

  photo_path    text,

  joined_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (event_id, user_id)
);

create index event_guests_event_idx on public.event_guests (event_id);

create trigger event_guests_touch
  before update on public.event_guests
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- ¿Eres de este evento?
-- ---------------------------------------------------------------------------

-- La pregunta de la que cuelgan todas las políticas de aquí. En una sola
-- función, por lo mismo que `can_view_wardrobe()`: repetida a mano en seis
-- sitios, bastaría con olvidarse de actualizar uno.
--
-- `security definer` porque tiene que mirar filas de otras personas, que es lo
-- que RLS impide; `search_path` fijado para que nadie cuele una tabla suya.
create or replace function public.is_event_guest(event uuid, who uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_guests g
     where g.event_id = event and g.user_id = who
  ) or exists (
    select 1 from public.events e
     where e.id = event and e.owner_id = who
  );
$$;

revoke all on function public.is_event_guest(uuid, uuid) from public;
grant execute on function public.is_event_guest(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.events       enable row level security;
alter table public.event_guests enable row level security;

create policy "events: leer los míos y a los que voy"
  on public.events for select
  using (
    (select auth.uid()) = owner_id
    or public.is_event_guest(id, (select auth.uid()))
  );

create policy "events: crear los propios"
  on public.events for insert with check ((select auth.uid()) = owner_id);

create policy "events: cambiar los propios"
  on public.events for update using ((select auth.uid()) = owner_id)
                    with check ((select auth.uid()) = owner_id);

create policy "events: borrar los propios"
  on public.events for delete using ((select auth.uid()) = owner_id);

-- Las invitadas se ven entre ellas: es el sentido entero de la función.
create policy "event_guests: leer los del evento"
  on public.event_guests for select
  using (public.is_event_guest(event_id, (select auth.uid())));

-- Apuntarse es cosa de una misma. Quien invita no apunta a nadie: el enlace lo
-- acepta quien lo recibe, y así nadie aparece en una lista sin saberlo.
create policy "event_guests: apuntarme yo"
  on public.event_guests for insert with check ((select auth.uid()) = user_id);

create policy "event_guests: cambiar lo mío"
  on public.event_guests for update using ((select auth.uid()) = user_id)
                          with check ((select auth.uid()) = user_id);

-- Salirse una misma, o que la quite quien organiza.
create policy "event_guests: salirme o quitarme"
  on public.event_guests for delete
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.events e
                where e.id = event_id and e.owner_id = (select auth.uid()))
  );


-- ---------------------------------------------------------------------------
-- Storage: las fotos del evento
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

create policy "storage: subir fotos de evento propias"
  on storage.objects for insert
  with check (
    bucket_id = 'event-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: leer las fotos de evento propias"
  on storage.objects for select
  using (
    bucket_id = 'event-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: borrar las fotos de evento propias"
  on storage.objects for delete
  using (
    bucket_id = 'event-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Las demás invitadas no encajan en esas políticas, y así debe ser: sus fotos
-- se les sirven con URL firmada generada en el servidor, después de comprobar
-- que son del evento.


-- ---------------------------------------------------------------------------
-- El embudo
-- ---------------------------------------------------------------------------

alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check
  check (event in (
    'demo_viewed', 'install_viewed', 'registered', 'photos_uploaded',
    'analysis_done', 'first_proposal', 'opened_day',
    'poll_created', 'poll_opened', 'poll_voted',
    'circle_invited', 'circle_joined',
    'loan_requested', 'loan_accepted',
    'event_created', 'event_joined'
  ));
