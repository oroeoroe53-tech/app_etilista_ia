-- ===========================================================================
-- 0015 — Retos de la semana y duelo de armarios
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- challenge_joins — quién se ha apuntado al reto de la semana
-- ---------------------------------------------------------------------------

-- Lo único que se guarda de un reto es **que te apuntaste**.
--
-- El progreso NO se guarda: se calcula del historial de lo que te has puesto,
-- cada vez (`lib/challenges/catalogue.ts`). Un contador propio sería una
-- segunda versión de la verdad, y el día que fallara al escribirse enseñaría
-- un número que no cuadra con el diario. Además, así nadie puede decir que ha
-- completado un reto: o está en el historial o no está.
create table public.challenge_joins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- El identificador del catálogo, que vive en código. Sin clave ajena a
  -- propósito: los retos se escriben, se retiran y se reescriben sin migración.
  challenge_id  text not null check (char_length(challenge_id) between 1 and 40),

  -- El lunes de la semana. Apuntarse es por semana, no para siempre.
  week_start    date not null,

  completed_at  timestamptz,
  created_at    timestamptz not null default now(),

  unique (user_id, challenge_id, week_start)
);

create index challenge_joins_week_idx on public.challenge_joins (week_start, challenge_id);

alter table public.challenge_joins enable row level security;

-- Lo tuyo, y lo de tu círculo: la tarjeta del reto enseña quién se ha apuntado,
-- y sin esto sería una lista siempre vacía.
create policy "challenge_joins: leer los del círculo"
  on public.challenge_joins for select
  using (
    (select auth.uid()) = user_id
    or public.in_same_circle(user_id, (select auth.uid()))
  );

create policy "challenge_joins: apuntarme yo"
  on public.challenge_joins for insert with check ((select auth.uid()) = user_id);

create policy "challenge_joins: marcar el mío"
  on public.challenge_joins for update using ((select auth.uid()) = user_id)
                             with check ((select auth.uid()) = user_id);

create policy "challenge_joins: salirme"
  on public.challenge_joins for delete using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- duels — duelo de armarios, a ciegas
-- ---------------------------------------------------------------------------

-- Dos personas, una ocasión, un look cada una montado por el motor, y el
-- círculo vota **sin saber de quién es cada uno**. Los nombres salen al votar.
--
-- La parte importante no es el juego: es que **hace falta que la otra acepte**.
-- Un duelo enseña la ropa de dos personas a un grupo, y la mitad de esa ropa no
-- es de quien lo propone. Sin aceptación, esto sería una forma de publicar el
-- armario ajeno con la excusa de un juego.
create table public.duels (
  id             uuid primary key default gen_random_uuid(),

  challenger_id  uuid not null references auth.users(id) on delete cascade,
  opponent_id    uuid not null references auth.users(id) on delete cascade,

  -- La ocasión para la que compone el motor: «brunch de domingo».
  occasion       text not null check (char_length(occasion) between 1 and 40),

  --   pending  → propuesto, esperando a que ella acepte
  --   open     → aceptado; los dos looks existen y se puede votar
  --   declined → dijo que no
  --   closed   → se acabó el tiempo
  status         text not null default 'pending'
                 check (status in ('pending','open','declined','closed')),

  -- Los looks, uno por lado. El del retador se compone al proponer; el de ella,
  -- al aceptar: así no se compone con su ropa antes de que diga que sí.
  challenger_outfit_id uuid references public.outfits(id) on delete set null,
  opponent_outfit_id   uuid references public.outfits(id) on delete set null,

  closes_at      timestamptz,
  created_at     timestamptz not null default now(),

  constraint duels_no_self check (challenger_id <> opponent_id)
);

create index duels_people_idx on public.duels (challenger_id, opponent_id, status);

alter table public.duels enable row level security;

-- Lo ven los dos lados y los círculos de ambos: el duelo se vota entre amigas.
create policy "duels: leer los que me tocan"
  on public.duels for select
  using (
    (select auth.uid()) in (challenger_id, opponent_id)
    or public.in_same_circle(challenger_id, (select auth.uid()))
    or public.in_same_circle(opponent_id, (select auth.uid()))
  );

-- Retar exige que la otra persona esté en tu círculo. Un duelo con una
-- desconocida no es un juego, es una forma de meterse donde no te llaman.
create policy "duels: retar a alguien de mi círculo"
  on public.duels for insert
  with check (
    (select auth.uid()) = challenger_id
    and status = 'pending'
    and public.in_same_circle((select auth.uid()), opponent_id)
  );

create policy "duels: contestar o cerrar el mío"
  on public.duels for update
  using ((select auth.uid()) in (challenger_id, opponent_id))
  with check ((select auth.uid()) in (challenger_id, opponent_id));


-- ---------------------------------------------------------------------------
-- duel_votes
-- ---------------------------------------------------------------------------

create table public.duel_votes (
  id          uuid primary key default gen_random_uuid(),
  duel_id     uuid not null references public.duels(id) on delete cascade,
  voter_id    uuid not null references auth.users(id) on delete cascade,

  -- A o B. Cuál es cuál lo decide el orden en pantalla, no quién es quién: el
  -- voto se guarda por lado, y el lado no dice de quién es el armario.
  side        text not null check (side in ('a','b')),

  created_at  timestamptz not null default now(),

  unique (duel_id, voter_id)
);

create index duel_votes_duel_idx on public.duel_votes (duel_id);

alter table public.duel_votes enable row level security;

-- Se puede leer quién ha votado qué —el recuento es el resultado— pero escribir
-- solo el propio voto, y nunca el de los duelistas: votarse a una misma no es
-- una opinión.
create policy "duel_votes: leer los del duelo que puedo ver"
  on public.duel_votes for select
  using (
    exists (
      select 1 from public.duels d
       where d.id = duel_id
         and (
           (select auth.uid()) in (d.challenger_id, d.opponent_id)
           or public.in_same_circle(d.challenger_id, (select auth.uid()))
           or public.in_same_circle(d.opponent_id, (select auth.uid()))
         )
    )
  );

create policy "duel_votes: votar yo, y no siendo del duelo"
  on public.duel_votes for insert
  with check (
    (select auth.uid()) = voter_id
    and exists (
      select 1 from public.duels d
       where d.id = duel_id
         and d.status = 'open'
         and (select auth.uid()) not in (d.challenger_id, d.opponent_id)
    )
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
    'styled_sent', 'look_shared',
    'challenge_joined', 'duel_created', 'duel_voted'
  ));
