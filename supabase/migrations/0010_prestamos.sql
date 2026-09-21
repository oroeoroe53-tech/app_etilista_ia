-- ===========================================================================
-- 0010 — Armarios compartidos y préstamos
--
-- Ver la ropa de alguien de tu círculo que te ha dado permiso, y pedirle una
-- prenda prestada.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO HACE, Y ES LA DECISIÓN MÁS IMPORTANTE DE TODAS
-- ---------------------------------------------------------------------------
--
-- No se añade una política de lectura a `clothing_items`. Lo natural habría
-- sido escribir esto:
--
--     create policy "ver el armario de quien me ha dado permiso"
--       on public.clothing_items for select
--       using (public.can_view_wardrobe(user_id, (select auth.uid())));
--
-- y habría sido un desastre silencioso. Ninguna consulta del armario en esta
-- aplicación filtra por `user_id`: todas se apoyan en que RLS solo devuelve lo
-- propio. Con esa política, la ropa de tus amigas aparecería dentro de TU
-- armario, dentro del motor que te propone looks, dentro de tu perfil de estilo
-- y dentro de la maleta. Sin un solo error visible: simplemente, prendas que no
-- son tuyas metiéndose en tus conjuntos.
--
-- Así que el armario ajeno se lee desde el servidor, filtrando a mano por el
-- dueño y después de comprobar el permiso (`lib/wardrobe/shared.ts`). Es la
-- misma decisión que en las votaciones: cuando hace falta ver algo ajeno, la
-- cerradura está en el código y no en una política que afecta a todo lo demás.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- loans — quién tiene qué, y desde cuándo
-- ---------------------------------------------------------------------------

create table public.loans (
  id           uuid primary key default gen_random_uuid(),

  item_id      uuid not null references public.clothing_items(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  borrower_id  uuid not null references auth.users(id) on delete cascade,

  /*
   * El recorrido entero de un préstamo real:
   *   requested → accepted → returned
   *   requested → declined
   *   requested → cancelled   (se arrepiente quien pidió)
   *
   * `declined` existe y se guarda en vez de borrarse: quien pidió tiene que
   * poder ver que le han dicho que no, en lugar de que su petición desaparezca
   * y no saber si llegó.
   */
  status       text not null default 'requested'
               check (status in ('requested','accepted','declined','returned','cancelled')),

  -- «para la boda del sábado». Lo que convierte una notificación en un favor.
  message      text check (message is null or char_length(message) <= 140),

  -- Cuándo se devuelve. Opcional: entre hermanas casi nunca se pone, y
  -- obligarlo haría que la mitad de los préstamos no se registraran.
  due_on       date,

  /*
   * Si la prenda estaba disponible antes de prestarla.
   *
   * Al aceptar, la prenda se marca como no disponible para que el motor deje de
   * proponerla —no puedes ponerte lo que no tienes en casa—. Al devolverla hay
   * que dejarla como estaba, y «como estaba» no siempre es disponible: pudo
   * estar guardada de temporada. Sin este dato, devolver una prenda la sacaría
   * del trastero sin que nadie lo hubiera pedido.
   */
  was_available boolean,

  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  returned_at  timestamptz,

  constraint loans_no_self check (owner_id <> borrower_id)
);

create index loans_owner_idx    on public.loans (owner_id, status);
create index loans_borrower_idx on public.loans (borrower_id, status);

-- Una prenda no puede estar prestada dos veces a la vez, ni tener dos
-- peticiones vivas de la misma persona. Índice parcial: lo devuelto y lo
-- rechazado no estorba.
create unique index loans_one_live_per_item
  on public.loans (item_id)
  where status in ('requested','accepted');

comment on table public.loans is
  'Préstamos de prendas entre gente del círculo. El armario ajeno se lee desde el servidor, no por RLS.';


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.loans enable row level security;

-- Las dos partes ven el préstamo. Nadie más, aunque sea del mismo círculo:
-- quién le ha pedido qué a quién no es asunto de terceros.
create policy "loans: leer los míos"
  on public.loans for select
  using ((select auth.uid()) in (owner_id, borrower_id));

/*
 * Pedir prestado exige el permiso, y la política lo comprueba.
 *
 * Esta es la única vez que `can_view_wardrobe()` se usa dentro de una política:
 * aquí sí puede, porque afecta solo a esta tabla y no cambia lo que devuelve
 * ninguna consulta existente.
 */
create policy "loans: pedir lo que puedo ver"
  on public.loans for insert
  with check (
    (select auth.uid()) = borrower_id
    and status = 'requested'
    and public.can_view_wardrobe(owner_id, (select auth.uid()))
  );

-- Aceptar, rechazar, cancelar y devolver. Quién puede hacer qué lo decide el
-- código; la política se limita a exigir que seas una de las dos partes.
create policy "loans: mover los míos"
  on public.loans for update
  using ((select auth.uid()) in (owner_id, borrower_id))
  with check ((select auth.uid()) in (owner_id, borrower_id));


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
    -- Un préstamo aceptado es la señal más fuerte de que el círculo se usa de
    -- verdad: dos personas, un objeto físico y una conversación fuera de aquí.
    'loan_requested', 'loan_accepted'
  ));
