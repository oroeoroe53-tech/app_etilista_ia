-- ===========================================================================
-- 0009 — El círculo
--
-- Quién es de quién, y qué le deja ver.
--
-- Son DOS cosas distintas y el error más caro de este diseño sería mezclarlas:
--
--   · `connections`      — «esta persona es de mi círculo».
--   · `wardrobe_grants`  — «esta persona puede ver mi armario».
--
-- Lo primero es una relación; lo segundo es un permiso. Si añadir a alguien al
-- círculo abriera el armario de golpe, la decisión de enseñar toda tu ropa se
-- tomaría en el mismo gesto con el que se acepta una invitación —con prisa y
-- sin leerlo— y nadie recordaría haberla tomado. Por eso el permiso se concede
-- después, uno a uno, y se puede retirar sin romper la amistad.
--
-- De aquí cuelgan las tres funciones siguientes (préstamos, eventos y estilista
-- de confianza). Todas preguntarán a `wardrobe_grants`, nunca a `connections`.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- circle_invites — el enlace para entrar en el círculo de alguien
-- ---------------------------------------------------------------------------

create table public.circle_invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references auth.users(id) on delete cascade,

  -- Mismo alfabeto y misma longitud que el token de votación, y por los mismos
  -- motivos: no se adivina y se puede dictar por teléfono.
  token       text not null unique check (char_length(token) between 8 and 24),

  -- Una invitación es para una persona. Reutilizable sería un enlace que, una
  -- vez reenviado, mete en tu círculo a quien pase por ahí.
  used_by     uuid references auth.users(id) on delete set null,
  used_at     timestamptz,

  -- Siete días. Una invitación de hace tres meses que sigue funcionando es un
  -- enlace olvidado en una conversación que ya nadie recuerda.
  expires_at  timestamptz not null default now() + interval '7 days',

  created_at  timestamptz not null default now()
);

create index circle_invites_inviter_idx on public.circle_invites (inviter_id, created_at desc);


-- ---------------------------------------------------------------------------
-- connections — el círculo
-- ---------------------------------------------------------------------------

-- Cada relación se guarda DOS veces, una por sentido.
--
-- La alternativa clásica —una sola fila con el par ordenado— obliga a que cada
-- consulta pregunte «¿soy yo el primero o el segundo?», y esa condición acaba
-- metiéndose dentro de las políticas de seguridad, que es el último sitio donde
-- uno quiere lógica difícil de leer. Con dos filas, toda política es
-- `auth.uid() = user_id` y se entiende de un vistazo.
create table public.connections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  friend_id   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),

  unique (user_id, friend_id),
  constraint connections_no_self check (user_id <> friend_id)
);

create index connections_user_idx on public.connections (user_id);


-- ---------------------------------------------------------------------------
-- wardrobe_grants — el permiso
-- ---------------------------------------------------------------------------

create table public.wardrobe_grants (
  id          uuid primary key default gen_random_uuid(),

  -- Quien enseña.
  owner_id    uuid not null references auth.users(id) on delete cascade,
  -- Quien mira.
  viewer_id   uuid not null references auth.users(id) on delete cascade,

  -- `view`  — puede ver tu armario y pedirte prestada una prenda.
  -- `style` — además puede montarte looks con tu ropa. Es más, no es otra cosa,
  --           y por eso es un nivel y no una tabla aparte.
  level       text not null default 'view' check (level in ('view', 'style')),

  created_at  timestamptz not null default now(),

  unique (owner_id, viewer_id),
  constraint wardrobe_grants_no_self check (owner_id <> viewer_id)
);

create index wardrobe_grants_viewer_idx on public.wardrobe_grants (viewer_id);

comment on table public.wardrobe_grants is
  'Permiso explícito para ver el armario de alguien. Estar en el círculo NO lo concede.';


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.circle_invites  enable row level security;
alter table public.connections     enable row level security;
alter table public.wardrobe_grants enable row level security;

-- Invitaciones: cada quien las suyas. Quien la acepta llega por el token y por
-- el servidor, igual que en la votación (ver `0008_votacion.sql`).
create policy "circle_invites: leer las propias"
  on public.circle_invites for select using ((select auth.uid()) = inviter_id);
create policy "circle_invites: crear las propias"
  on public.circle_invites for insert with check ((select auth.uid()) = inviter_id);
create policy "circle_invites: borrar las propias"
  on public.circle_invites for delete using ((select auth.uid()) = inviter_id);

-- El círculo se lee y se deshace desde el cliente; se crea desde el servidor,
-- que es quien ha validado la invitación y quien escribe las DOS filas a la vez.
create policy "connections: leer el propio círculo"
  on public.connections for select using ((select auth.uid()) = user_id);

-- Irse del círculo de alguien no necesita su permiso. Esto borra el lado
-- propio; el servidor borra el otro y los permisos que hubiera.
create policy "connections: salir del propio círculo"
  on public.connections for delete using ((select auth.uid()) = user_id);

-- Permisos: los da y los quita quien enseña. Quien mira puede ver qué le han
-- dado —tiene derecho a saber a qué tiene acceso— pero no puede dárselo.
create policy "wardrobe_grants: leer los que doy"
  on public.wardrobe_grants for select using ((select auth.uid()) = owner_id);
create policy "wardrobe_grants: leer los que me han dado"
  on public.wardrobe_grants for select using ((select auth.uid()) = viewer_id);

create policy "wardrobe_grants: darlos"
  on public.wardrobe_grants for insert with check ((select auth.uid()) = owner_id);
create policy "wardrobe_grants: cambiarlos"
  on public.wardrobe_grants for update using ((select auth.uid()) = owner_id)
                             with check ((select auth.uid()) = owner_id);
create policy "wardrobe_grants: quitarlos"
  on public.wardrobe_grants for delete using ((select auth.uid()) = owner_id);


-- ---------------------------------------------------------------------------
-- La función que de verdad importa
-- ---------------------------------------------------------------------------

-- `puede_ver_armario(dueño, mirón)` es la pregunta que van a hacer todas las
-- políticas de las funciones que vienen después: el armario compartido, los
-- préstamos y quien te monta looks.
--
-- Vive aquí, en una sola función, para que esa respuesta se dé en un único
-- sitio. Repetida a mano en cinco políticas, bastaría con olvidarse de
-- actualizar una el día que cambie la regla.
--
-- `security definer` porque tiene que leer `wardrobe_grants` de otra persona,
-- que es justo lo que RLS impide; `search_path` fijado para que nadie pueda
-- colar una tabla suya con ese nombre.
create or replace function public.can_view_wardrobe(owner uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wardrobe_grants g
     where g.owner_id = owner and g.viewer_id = viewer
  );
$$;

revoke all on function public.can_view_wardrobe(uuid, uuid) from public;
grant execute on function public.can_view_wardrobe(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- El embudo
-- ---------------------------------------------------------------------------

alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check
  check (event in (
    'demo_viewed', 'install_viewed', 'registered', 'photos_uploaded',
    'analysis_done', 'first_proposal', 'opened_day',
    'poll_created', 'poll_opened', 'poll_voted',
    -- `circle_joined` es la otra mitad del boca a boca, junto a `poll_voted`:
    -- gente que llega porque alguien de dentro la ha traído.
    'circle_invited', 'circle_joined'
  ));
