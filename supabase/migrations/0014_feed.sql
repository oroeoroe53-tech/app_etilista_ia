-- ===========================================================================
-- 0014 — Publicar el look del día
--
-- «Mi IA me ha vestido hoy». Enseñas a tu círculo lo que te has puesto, y ves
-- lo que se han puesto ellas.
--
-- Tres decisiones que están en la tabla y no en la pantalla, para que no se
-- puedan deshacer por descuido:
--
--  1. **Se publica UN look por día.** No es una red social: no hay muro que
--     alimentar ni nada que ganar publicando más. Una vez al día, o ninguna.
--  2. **No se publica solo.** Hace falta darle a un botón cada día. Un
--     interruptor de «compartir siempre» acabaría enseñando a diario ropa que
--     nadie decidió enseñar ese día concreto.
--  3. **Lo ve tu círculo y nadie más.** No hay feed público, ni descubrimiento,
--     ni gente que no conozcas. Si algún día alguien quiere eso, será otra
--     tabla y otra conversación, no una política relajada en esta.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- ¿Somos del mismo círculo?
-- ---------------------------------------------------------------------------

-- La tercera de la familia, junto a `can_view_wardrobe()` y `can_style_wardrobe()`.
-- Esta es más débil a propósito: estar en el círculo no abre el armario (ver
-- `0009_circulo.sql`), pero sí deja ver lo que la otra persona ha decidido
-- publicar.
create or replace function public.in_same_circle(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.connections c
     where c.user_id = a and c.friend_id = b
  );
$$;

revoke all on function public.in_same_circle(uuid, uuid) from public;
grant execute on function public.in_same_circle(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- daily_shares
-- ---------------------------------------------------------------------------

create table public.daily_shares (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- El look publicado. Si se borra, se va la publicación con él: enseñar una
  -- ficha vacía de algo que ya no existe no le sirve a nadie.
  outfit_id   uuid not null references public.outfits(id) on delete cascade,

  -- «al final me puse las botas». Opcional, y casi nadie escribirá nada.
  note        text check (note is null or char_length(note) <= 140),

  shared_on   date not null default current_date,
  created_at  timestamptz not null default now(),

  -- Uno por día y persona. Publicar de nuevo sustituye, no acumula.
  unique (user_id, shared_on)
);

create index daily_shares_recent_idx on public.daily_shares (shared_on desc, user_id);

comment on table public.daily_shares is
  'Looks que alguien enseña a su círculo. Uno por día, a mano, y solo para el círculo.';


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.daily_shares enable row level security;

-- Lo tuyo, y lo de quien te tiene en su círculo.
--
-- Nótese el orden de los argumentos: `in_same_circle(user_id, auth.uid())`
-- pregunta si **quien publicó** tiene en su círculo a quien mira. Al revés
-- —que yo te tenga a ti— dejaría ver las publicaciones de alguien que te quitó
-- de su círculo y no lo sabe.
create policy "daily_shares: leer las del círculo"
  on public.daily_shares for select
  using (
    (select auth.uid()) = user_id
    or public.in_same_circle(user_id, (select auth.uid()))
  );

create policy "daily_shares: publicar las propias"
  on public.daily_shares for insert with check ((select auth.uid()) = user_id);

create policy "daily_shares: cambiar las propias"
  on public.daily_shares for update using ((select auth.uid()) = user_id)
                          with check ((select auth.uid()) = user_id);

-- Despublicar. Sin rastro y sin aviso a nadie.
create policy "daily_shares: quitar las propias"
  on public.daily_shares for delete using ((select auth.uid()) = user_id);


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
    'event_created', 'event_joined',
    'styled_sent',
    'look_shared'
  ));
