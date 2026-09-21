-- ===========================================================================
-- 0008 — Votación: «¿cuál me pongo?»
--
-- La primera vez que esta aplicación deja que una persona vea algo de otra.
--
-- Hasta aquí, todas las políticas decían `auth.uid() = user_id` y no había
-- excepciones: cada uno lo suyo. Una votación rompe eso por definición —unas
-- fotos tuyas tienen que verlas tus amigas— así que la apertura se hace por el
-- sitio más estrecho posible y con una regla que no se negocia:
--
--   **Nadie llega a una votación ajena por RLS. Se llega por el enlace.**
--
-- El identificador secreto va en el enlace (`token`), y RLS no puede
-- comprobarlo: una política solo sabe quién pregunta, no con qué enlace ha
-- llegado. Por eso `polls` y `poll_options` NO tienen política de lectura para
-- terceros. Quien no es el dueño llega a la votación a través de código de
-- servidor que primero valida el token y solo entonces usa el service role.
--
-- Dicho de otro modo: el token es la llave, y la cerradura está en el servidor,
-- no en la base de datos. Si algún día alguien añade aquí una política del tipo
-- «cualquier autenticado puede leer votaciones», convertirá el identificador en
-- enumerable y el armario de la gente en visible. No se añade.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- polls — la pregunta
-- ---------------------------------------------------------------------------

create table public.polls (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,

  -- El texto de arriba: «cena con los de la oficina». Opcional: hay prisa.
  question    text check (question is null or char_length(question) <= 120),

  -- El secreto del enlace. 12 caracteres de un alfabeto sin ambigüedades (ni
  -- 0/O ni 1/l), que son ~62 bits: no se adivina probando, y sigue cabiendo en
  -- un mensaje sin ocupar dos líneas.
  token       text not null unique check (char_length(token) between 8 and 24),

  -- La cuenta atrás. Es lo que convierte esto en útil: sin una hora a la que
  -- te vas, nadie contesta en diez minutos. La pone quien pregunta.
  closes_at   timestamptz not null,

  -- Cuándo desaparece TODO: filas y fotos.
  --
  -- Estas fotos no son como las del armario. Son fotos de una persona vestida,
  -- y su enlace ha pasado por un grupo de mensajería, o sea que ha salido del
  -- control de quien las subió. Lo único responsable es que caduquen solas y
  -- pronto. Veinticuatro horas sobran para una decisión que se toma en veinte
  -- minutos.
  expires_at  timestamptz not null default now() + interval '24 hours',

  created_at  timestamptz not null default now()
);

create index polls_owner_idx  on public.polls (owner_id, created_at desc);
create index polls_expiry_idx on public.polls (expires_at);

comment on table public.polls is
  'Votaciones «¿cuál me pongo?». El token del enlace es la llave, y se valida en el servidor, no en RLS.';


-- ---------------------------------------------------------------------------
-- poll_options — las opciones, de dos a cuatro
-- ---------------------------------------------------------------------------

create table public.poll_options (
  id            uuid primary key default gen_random_uuid(),
  poll_id       uuid not null references public.polls(id) on delete cascade,

  -- Ruta en el bucket `poll-photos`. Se sirve siempre con URL firmada corta.
  storage_path  text not null,

  -- «el negro». Opcional, y casi nadie lo va a escribir con prisa.
  label         text check (label is null or char_length(label) <= 40),

  position      smallint not null check (position between 1 and 4),

  created_at    timestamptz not null default now(),

  unique (poll_id, position)
);

create index poll_options_poll_idx on public.poll_options (poll_id, position);


-- ---------------------------------------------------------------------------
-- poll_votes — un voto por persona
-- ---------------------------------------------------------------------------

create table public.poll_votes (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.polls(id) on delete cascade,
  option_id   uuid not null references public.poll_options(id) on delete cascade,

  -- Quién vota. Con cuenta obligatoria: votar es el momento en que esta
  -- aplicación se gana a alguien que ha llegado por el mensaje de una amiga, y
  -- además un voto anónimo deja la votación abierta a que la misma persona
  -- vote cinco veces.
  voter_id    uuid not null references auth.users(id) on delete cascade,

  -- Una línea corta: «con las botas». Es lo que de verdad quiere leer.
  comment     text check (comment is null or char_length(comment) <= 140),

  created_at  timestamptz not null default now(),

  -- Un voto por persona y votación. Cambiar de opinión actualiza, no acumula.
  unique (poll_id, voter_id)
);

create index poll_votes_poll_idx on public.poll_votes (poll_id);


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes   enable row level security;

-- El dueño, y solo el dueño, maneja su votación por RLS.
--
-- Quien vota NO aparece aquí a propósito: llega por el servidor, que valida el
-- token antes de mirar nada. Ver la nota de la cabecera.
create policy "polls: leer las propias"
  on public.polls for select using ((select auth.uid()) = owner_id);
create policy "polls: crear las propias"
  on public.polls for insert with check ((select auth.uid()) = owner_id);
create policy "polls: borrar las propias"
  on public.polls for delete using ((select auth.uid()) = owner_id);

-- Cerrar antes de tiempo («ya está, me voy») es lo único que el dueño puede
-- cambiar. Ni el token ni las opciones: una votación cuyo contenido cambia
-- mientras la gente vota no decide nada.
create policy "polls: cerrar la propia"
  on public.polls for update using ((select auth.uid()) = owner_id)
                   with check ((select auth.uid()) = owner_id);

create policy "poll_options: leer las de la votación propia"
  on public.poll_options for select using (
    exists (select 1 from public.polls p
             where p.id = poll_id and p.owner_id = (select auth.uid()))
  );
create policy "poll_options: crear las de la votación propia"
  on public.poll_options for insert with check (
    exists (select 1 from public.polls p
             where p.id = poll_id and p.owner_id = (select auth.uid()))
  );

-- Los votos no se tocan desde el cliente. Se escriben desde el servidor, que
-- es quien ha comprobado el token, que la votación sigue abierta y que quien
-- vota no es quien pregunta. Nada de eso lo puede comprobar una política.
--
-- Y el dueño tampoco los borra: una votación que se puede editar no sirve para
-- decidir nada.
revoke all on public.poll_votes from anon, authenticated;


-- ---------------------------------------------------------------------------
-- Storage: un bucket aparte para las fotos de votación
-- ---------------------------------------------------------------------------

-- Aparte del armario a propósito. Estas fotos tienen otra vida: se ven desde
-- fuera, duran un día y se borran solas. Mezclarlas con `user-outfit-photos`
-- sería aplicar dos reglas distintas al mismo sitio, que es como se acaban
-- borrando cosas que no tocaba.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('poll-photos', 'poll-photos', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

-- Misma convención que el resto: la primera carpeta es el uid de quien sube.
create policy "storage: subir fotos de votación propias"
  on storage.objects for insert
  with check (
    bucket_id = 'poll-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: leer las fotos de votación propias"
  on storage.objects for select
  using (
    bucket_id = 'poll-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: borrar las fotos de votación propias"
  on storage.objects for delete
  using (
    bucket_id = 'poll-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Quien vota no encaja en esas políticas —la carpeta no es suya— y así debe
-- ser. Las fotos se le sirven con URL firmada de diez minutos generada en el
-- servidor después de validar el token.


-- ---------------------------------------------------------------------------
-- El embudo aprende tres momentos nuevos
-- ---------------------------------------------------------------------------

-- `poll_voted` es, con diferencia, el evento más valioso de la aplicación: es
-- alguien que se ha registrado porque una amiga le pidió opinión. Si el boca a
-- boca funciona, se ve aquí antes que en ningún otro sitio.
alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check
  check (event in (
    'demo_viewed', 'install_viewed', 'registered', 'photos_uploaded',
    'analysis_done', 'first_proposal', 'opened_day',
    'poll_created', 'poll_opened', 'poll_voted'
  ));
