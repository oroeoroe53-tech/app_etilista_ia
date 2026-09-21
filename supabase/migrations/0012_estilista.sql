-- ===========================================================================
-- 0012 — Estilista de confianza
--
-- Alguien de tu círculo —una amiga, tu pareja, una estilista de verdad— te
-- monta un look **con tu ropa**, y te llega.
--
-- Es la última de las cuatro funciones sociales y la más barata de todas,
-- porque el permiso ya existía desde `0009_circulo.sql`: el nivel `style` de
-- `wardrobe_grants` estaba escrito, se guardaba y se leía, esperando a esto.
-- Lo único que hacía falta era dónde guardar lo que monta.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- ¿Puede vestirme?
-- ---------------------------------------------------------------------------

-- La hermana mayor de `can_view_wardrobe()`. Son dos funciones y no una con un
-- parámetro porque se preguntan en sitios distintos y responden a cosas
-- distintas: ver la ropa y decidir cómo se combina no es lo mismo, y la
-- diferencia entre las dos es justo lo que el dial de tres estados le pregunta
-- a la gente.
create or replace function public.can_style_wardrobe(owner uuid, stylist uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wardrobe_grants g
     where g.owner_id = owner
       and g.viewer_id = stylist
       and g.level = 'style'
  );
$$;

revoke all on function public.can_style_wardrobe(uuid, uuid) from public;
grant execute on function public.can_style_wardrobe(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- styled_looks — lo que alguien te ha montado
-- ---------------------------------------------------------------------------

create table public.styled_looks (
  id          uuid primary key default gen_random_uuid(),

  -- Quien se lo pone.
  owner_id    uuid not null references auth.users(id) on delete cascade,
  -- Quien lo ha montado.
  stylist_id  uuid not null references auth.users(id) on delete cascade,

  -- «para el viernes, con las botas marrones». Es la mitad del regalo.
  note        text check (note is null or char_length(note) <= 200),

  -- Cuándo lo vio. Sirve para el aviso de la portada y para que quien lo montó
  -- sepa si ha llegado, que es lo primero que se pregunta al mandar algo.
  seen_at     timestamptz,

  created_at  timestamptz not null default now(),

  constraint styled_looks_no_self check (owner_id <> stylist_id)
);

create index styled_looks_owner_idx on public.styled_looks (owner_id, created_at desc);

-- Tabla aparte y no un array de identificadores: así, cuando alguien borra una
-- prenda de su armario, la cascada se lleva su presencia en los looks que le
-- montaron y no queda un identificador apuntando a nada.
create table public.styled_look_items (
  id        uuid primary key default gen_random_uuid(),
  look_id   uuid not null references public.styled_looks(id) on delete cascade,
  item_id   uuid not null references public.clothing_items(id) on delete cascade,
  position  smallint not null check (position between 1 and 8),

  unique (look_id, item_id)
);

create index styled_look_items_look_idx on public.styled_look_items (look_id, position);

comment on table public.styled_looks is
  'Looks que alguien del círculo monta con la ropa de otra persona. Exige el nivel "style" del permiso.';


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.styled_looks      enable row level security;
alter table public.styled_look_items enable row level security;

-- Las dos partes lo ven: quien lo lleva y quien lo montó. Nadie más.
create policy "styled_looks: leer los míos"
  on public.styled_looks for select
  using ((select auth.uid()) in (owner_id, stylist_id));

-- Montar exige el permiso, y la política lo comprueba. Igual que con los
-- préstamos: se puede hacer aquí porque afecta a una tabla nueva y no cambia
-- lo que devuelve ninguna consulta anterior.
create policy "styled_looks: montar a quien me deja"
  on public.styled_looks for insert
  with check (
    (select auth.uid()) = stylist_id
    and public.can_style_wardrobe(owner_id, (select auth.uid()))
  );

-- Quien lo lleva puede marcarlo como visto; quien lo montó, no. Que alguien
-- pueda marcar por ti que has visto algo vacía el dato de sentido.
create policy "styled_looks: marcar visto lo mío"
  on public.styled_looks for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Borrar: quien lo lleva, porque es suyo y puede no querer verlo más; y quien
-- lo montó, porque puede arrepentirse de haberlo mandado.
create policy "styled_looks: borrar los míos"
  on public.styled_looks for delete
  using ((select auth.uid()) in (owner_id, stylist_id));

-- Las prendas del look siguen al look.
create policy "styled_look_items: leer los del look"
  on public.styled_look_items for select
  using (
    exists (select 1 from public.styled_looks l
             where l.id = look_id
               and (select auth.uid()) in (l.owner_id, l.stylist_id))
  );

create policy "styled_look_items: ponerlos al montar"
  on public.styled_look_items for insert
  with check (
    exists (select 1 from public.styled_looks l
             where l.id = look_id and l.stylist_id = (select auth.uid()))
  );


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
    'styled_sent'
  ));
