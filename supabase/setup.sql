-- =============================================================================
-- ARCHIVO GENERADO - no editar a mano.
-- Concatenacion de supabase/migrations/ en orden, para ejecutarlo de una vez
-- en el editor SQL de Supabase.
-- Regenerar con: node scripts/build-setup-sql.mjs
-- =============================================================================

-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0001_init.sql
-- ===========================================================================
-- 0001 — Esquema inicial
-- AI Personal Stylist
--
-- Notas de diseño (ver PLAN.md §3.1):
--  · No hay tabla de atributos EAV. Columnas tipadas para lo que se filtra,
--    `attributes jsonb` para la cola larga.
--  · Los límites de plan NO están aquí: viven en lib/subscriptions/plans.ts.
--    En la base de datos solo está el consumo real (`usage_counters`).
--  · `clothing_items` usa borrado lógico para no dejar historial huérfano.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- utilidades
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  avatar_path      text,
  onboarding_stage text not null default 'not_started'
                   check (onboarding_stage in
                     ('not_started','photos_uploaded','analyzing','review','completed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- clothing_items — el armario
-- ---------------------------------------------------------------------------

create table public.clothing_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  category         text not null,
  subcategory      text,

  primary_color    text not null,
  secondary_colors text[] not null default '{}',
  pattern          text not null default 'solid',
  fit              text not null default 'unknown',
  material         text not null default 'unknown',

  styles           text[] not null default '{}',
  seasons          text[] not null default '{}',
  formality        smallint not null default 3 check (formality between 1 and 5),
  warmth           smallint not null default 3 check (warmth    between 1 and 5),

  image_path       text,
  source           text not null default 'manual'
                   check (source in ('onboarding','photo','manual')),

  is_available     boolean not null default true,
  condition        text not null default 'good'
                   check (condition in ('new','good','worn','retired')),
  notes            text,

  -- Cola larga de atributos que la IA devuelve y aún no tienen columna propia.
  attributes       jsonb not null default '{}'::jsonb,

  ai_confidence    real check (ai_confidence between 0 and 1),
  user_verified    boolean not null default false,

  times_worn       integer not null default 0,
  last_worn_at     date,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create trigger clothing_items_touch
  before update on public.clothing_items
  for each row execute function public.touch_updated_at();

-- Consulta dominante: "dame el armario vivo de este usuario, por categoría".
create index clothing_items_user_active_idx
  on public.clothing_items (user_id, category)
  where deleted_at is null;

-- Para la regla de novedad del motor ("no repitas lo de anteayer").
create index clothing_items_user_last_worn_idx
  on public.clothing_items (user_id, last_worn_at desc nulls first)
  where deleted_at is null;


-- ---------------------------------------------------------------------------
-- outfit_photos — las fotos del onboarding
-- ---------------------------------------------------------------------------

create table public.outfit_photos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  storage_path    text not null,
  optimized_path  text,
  width           integer,
  height          integer,

  -- El análisis es asíncrono (ver PLAN.md §9, riesgo 2): la petición HTTP
  -- no espera a la IA, el cliente consulta este estado.
  analysis_status text not null default 'pending'
                  check (analysis_status in ('pending','processing','done','failed','skipped')),
  analysis_error  text,
  analyzed_at     timestamptz,

  created_at      timestamptz not null default now()
);

create index outfit_photos_user_idx on public.outfit_photos (user_id, created_at desc);
create index outfit_photos_pending_idx
  on public.outfit_photos (analysis_status)
  where analysis_status in ('pending','processing');


-- ---------------------------------------------------------------------------
-- detected_items — salida cruda de la IA, antes de decidir qué es prenda nueva
--
-- Se guarda para poder reejecutar la deduplicación con un algoritmo mejor
-- SIN repetir ninguna llamada de visión (PLAN.md §41.3).
-- ---------------------------------------------------------------------------

create table public.detected_items (
  id               uuid primary key default gen_random_uuid(),
  photo_id         uuid not null references public.outfit_photos(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,

  raw              jsonb not null,
  bbox             jsonb,

  -- Identificador de grupo que devuelve el modelo al ver todas las fotos juntas:
  -- "estas tres detecciones son la misma prenda".
  garment_group    text,

  clothing_item_id uuid references public.clothing_items(id) on delete set null,
  match_confidence real check (match_confidence between 0 and 1),
  match_status     text not null default 'pending'
                   check (match_status in
                     ('pending','auto_merged','new_item','needs_confirmation','rejected')),

  created_at       timestamptz not null default now()
);

create index detected_items_photo_idx on public.detected_items (photo_id);
create index detected_items_user_status_idx on public.detected_items (user_id, match_status);


-- ---------------------------------------------------------------------------
-- outfits + outfit_items
-- ---------------------------------------------------------------------------

create table public.outfits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  source          text not null default 'engine'
                  check (source in ('engine','user','photo')),

  -- Contexto con el que se generó: ocasión, temperatura, lluvia, formalidad…
  context         jsonb not null default '{}'::jsonb,

  score           real,
  score_breakdown jsonb,
  explanation     text,

  created_at      timestamptz not null default now()
);

create index outfits_user_idx on public.outfits (user_id, created_at desc);

create table public.outfit_items (
  outfit_id        uuid not null references public.outfits(id) on delete cascade,
  clothing_item_id uuid not null references public.clothing_items(id) on delete cascade,
  role             text not null
                   check (role in ('top','bottom','outer','footwear','accessory','full_body')),
  primary key (outfit_id, clothing_item_id)
);

create index outfit_items_item_idx on public.outfit_items (clothing_item_id);


-- ---------------------------------------------------------------------------
-- outfit_feedback — las señales del swipe
-- ---------------------------------------------------------------------------

create table public.outfit_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  outfit_id  uuid not null references public.outfits(id) on delete cascade,

  reaction   text not null check (reaction in ('dislike','like','love','skip')),
  reason     text check (reason in
               ('color','fit','item','too_formal','too_casual','not_my_style','other')),

  created_at timestamptz not null default now(),

  -- Un usuario opina una vez por outfit; volver a opinar sustituye.
  unique (user_id, outfit_id)
);

create index outfit_feedback_user_idx on public.outfit_feedback (user_id, created_at desc);


-- ---------------------------------------------------------------------------
-- style_profile — pesos APRENDIDOS (internos, el usuario no los edita)
-- ---------------------------------------------------------------------------

create table public.style_profile (
  user_id        uuid primary key references auth.users(id) on delete cascade,

  style_weights  jsonb not null default '{}'::jsonb,   -- { minimal: 0.82, streetwear: 0.34 }
  color_weights  jsonb not null default '{}'::jsonb,   -- { black: 0.88, beige: 0.79 }
  fit_weights    jsonb not null default '{}'::jsonb,   -- { oversized: 0.81, skinny: 0.18 }
  formality_bias real not null default 0,              -- -1 informal … +1 formal

  -- Cuántas señales lo sostienen. Con pocas, el motor confía menos en el perfil.
  signal_count   integer not null default 0,

  updated_at     timestamptz not null default now()
);

create trigger style_profile_touch
  before update on public.style_profile
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- user_preferences — ajustes DECLARADOS por el usuario (sí los edita)
--
-- Separado a propósito de style_profile: el aprendizaje automático nunca debe
-- pisar lo que el usuario ha dicho de forma explícita.
-- ---------------------------------------------------------------------------

create table public.user_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,

  disliked_colors   text[] not null default '{}',
  never_combine     jsonb not null default '[]'::jsonb,  -- [[item_id_a, item_id_b], …]
  default_formality smallint check (default_formality between 1 and 5),

  units             text not null default 'metric' check (units in ('metric','imperial')),
  city              text,
  lat               double precision,
  lon               double precision,

  updated_at        timestamptz not null default now()
);

create trigger user_preferences_touch
  before update on public.user_preferences
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- wear_history
-- ---------------------------------------------------------------------------

create table public.wear_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  outfit_id        uuid references public.outfits(id) on delete set null,
  clothing_item_id uuid not null references public.clothing_items(id) on delete cascade,

  worn_on          date not null default current_date,
  occasion         text,
  source           text not null default 'manual' check (source in ('manual','outfit','photo')),

  created_at       timestamptz not null default now()
);

create index wear_history_user_date_idx on public.wear_history (user_id, worn_on desc);
create index wear_history_item_idx      on public.wear_history (clothing_item_id, worn_on desc);


-- ---------------------------------------------------------------------------
-- ai_usage — toda llamada de IA deja rastro aquí. Sin excepción.
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,

  provider           text not null,
  model              text not null,
  operation          text not null,

  input_tokens       integer,
  output_tokens      integer,
  image_count        integer not null default 0,
  estimated_cost_usd numeric(12,6),

  latency_ms         integer,
  status             text not null default 'ok' check (status in ('ok','error','fallback')),
  error_code         text,

  created_at         timestamptz not null default now()
);

create index ai_usage_user_idx      on public.ai_usage (user_id, created_at desc);
create index ai_usage_created_idx   on public.ai_usage (created_at desc);
create index ai_usage_operation_idx on public.ai_usage (operation, created_at desc);


-- ---------------------------------------------------------------------------
-- subscriptions — qué plan tiene. Los LÍMITES del plan no están aquí.
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  user_id              uuid primary key references auth.users(id) on delete cascade,

  plan                 text not null default 'free' check (plan in ('free','pro')),
  status               text not null default 'active'
                       check (status in ('active','past_due','canceled','trialing')),
  current_period_end   timestamptz,

  provider             text,          -- 'stripe' en la Fase 9
  provider_customer_id text,

  updated_at           timestamptz not null default now()
);

create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- usage_counters — consumo real. Solo escribe el service role.
--
-- `period_key` es el periodo ya resuelto: '2026-09-18' para métricas diarias,
-- '2026-09' para mensuales, 'all' para totales. Así un único índice sirve para
-- los tres casos y no hacen falta tablas distintas.
-- ---------------------------------------------------------------------------

create table public.usage_counters (
  user_id    uuid not null references auth.users(id) on delete cascade,
  period_key text not null,
  metric     text not null,
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_key, metric)
);


-- ---------------------------------------------------------------------------
-- Alta de usuario: crear las filas satélite en una sola transacción.
--
-- Si esto no existiera, media aplicación tendría que hacer "si no hay fila, créala"
-- en todas partes.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.subscriptions (user_id) values (new.id);
  insert into public.style_profile (user_id) values (new.id);
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0002_rls.sql
-- ===========================================================================
-- 0002 — Row Level Security
--
-- Regla general: cada usuario ve y toca únicamente sus propias filas.
--
-- Tres tablas son DELIBERADAMENTE de solo lectura para el usuario, porque si
-- pudiera escribirlas se saltaría el modelo de negocio:
--   · subscriptions   → se ascendería solo a Pro
--   · usage_counters  → pondría su consumo a cero
--   · ai_usage        → falsearía el registro de coste
-- Esas tres solo las escribe el service role (que salta RLS por definición).
-- ===========================================================================

alter table public.profiles         enable row level security;
alter table public.clothing_items   enable row level security;
alter table public.outfit_photos    enable row level security;
alter table public.detected_items   enable row level security;
alter table public.outfits          enable row level security;
alter table public.outfit_items     enable row level security;
alter table public.outfit_feedback  enable row level security;
alter table public.style_profile    enable row level security;
alter table public.user_preferences enable row level security;
alter table public.wear_history     enable row level security;
alter table public.ai_usage         enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.usage_counters   enable row level security;


-- --- profiles --------------------------------------------------------------
create policy "profiles: leer el propio"
  on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles: actualizar el propio"
  on public.profiles for update using ((select auth.uid()) = id)
                      with check ((select auth.uid()) = id);


-- --- clothing_items --------------------------------------------------------
create policy "clothing_items: leer los propios"
  on public.clothing_items for select using ((select auth.uid()) = user_id);
create policy "clothing_items: crear los propios"
  on public.clothing_items for insert with check ((select auth.uid()) = user_id);
create policy "clothing_items: actualizar los propios"
  on public.clothing_items for update using ((select auth.uid()) = user_id)
                            with check ((select auth.uid()) = user_id);
create policy "clothing_items: borrar los propios"
  on public.clothing_items for delete using ((select auth.uid()) = user_id);


-- --- outfit_photos ---------------------------------------------------------
create policy "outfit_photos: leer las propias"
  on public.outfit_photos for select using ((select auth.uid()) = user_id);
create policy "outfit_photos: crear las propias"
  on public.outfit_photos for insert with check ((select auth.uid()) = user_id);
create policy "outfit_photos: actualizar las propias"
  on public.outfit_photos for update using ((select auth.uid()) = user_id)
                           with check ((select auth.uid()) = user_id);
create policy "outfit_photos: borrar las propias"
  on public.outfit_photos for delete using ((select auth.uid()) = user_id);


-- --- detected_items --------------------------------------------------------
-- El usuario lee y confirma/rechaza; quien las crea es el job de análisis.
create policy "detected_items: leer los propios"
  on public.detected_items for select using ((select auth.uid()) = user_id);
create policy "detected_items: actualizar los propios"
  on public.detected_items for update using ((select auth.uid()) = user_id)
                            with check ((select auth.uid()) = user_id);


-- --- outfits ---------------------------------------------------------------
create policy "outfits: leer los propios"
  on public.outfits for select using ((select auth.uid()) = user_id);
create policy "outfits: crear los propios"
  on public.outfits for insert with check ((select auth.uid()) = user_id);
create policy "outfits: actualizar los propios"
  on public.outfits for update using ((select auth.uid()) = user_id)
                     with check ((select auth.uid()) = user_id);
create policy "outfits: borrar los propios"
  on public.outfits for delete using ((select auth.uid()) = user_id);


-- --- outfit_items ----------------------------------------------------------
-- No tiene user_id: la pertenencia se comprueba a través del outfit padre.
create policy "outfit_items: leer los del propio outfit"
  on public.outfit_items for select
  using (exists (
    select 1 from public.outfits o
    where o.id = outfit_id and o.user_id = (select auth.uid())
  ));
create policy "outfit_items: crear en el propio outfit"
  on public.outfit_items for insert
  with check (exists (
    select 1 from public.outfits o
    where o.id = outfit_id and o.user_id = (select auth.uid())
  ));
create policy "outfit_items: borrar del propio outfit"
  on public.outfit_items for delete
  using (exists (
    select 1 from public.outfits o
    where o.id = outfit_id and o.user_id = (select auth.uid())
  ));


-- --- outfit_feedback -------------------------------------------------------
create policy "outfit_feedback: leer el propio"
  on public.outfit_feedback for select using ((select auth.uid()) = user_id);
create policy "outfit_feedback: crear el propio"
  on public.outfit_feedback for insert with check ((select auth.uid()) = user_id);
create policy "outfit_feedback: actualizar el propio"
  on public.outfit_feedback for update using ((select auth.uid()) = user_id)
                             with check ((select auth.uid()) = user_id);


-- --- style_profile ---------------------------------------------------------
create policy "style_profile: leer el propio"
  on public.style_profile for select using ((select auth.uid()) = user_id);
create policy "style_profile: actualizar el propio"
  on public.style_profile for update using ((select auth.uid()) = user_id)
                           with check ((select auth.uid()) = user_id);


-- --- user_preferences ------------------------------------------------------
create policy "user_preferences: leer las propias"
  on public.user_preferences for select using ((select auth.uid()) = user_id);
create policy "user_preferences: actualizar las propias"
  on public.user_preferences for update using ((select auth.uid()) = user_id)
                              with check ((select auth.uid()) = user_id);


-- --- wear_history ----------------------------------------------------------
create policy "wear_history: leer el propio"
  on public.wear_history for select using ((select auth.uid()) = user_id);
create policy "wear_history: crear el propio"
  on public.wear_history for insert with check ((select auth.uid()) = user_id);
create policy "wear_history: borrar el propio"
  on public.wear_history for delete using ((select auth.uid()) = user_id);


-- --- ai_usage · subscriptions · usage_counters -----------------------------
-- SOLO LECTURA para el usuario. Escribe únicamente el service role.
create policy "ai_usage: leer el propio"
  on public.ai_usage for select using ((select auth.uid()) = user_id);

create policy "subscriptions: leer la propia"
  on public.subscriptions for select using ((select auth.uid()) = user_id);

create policy "usage_counters: leer los propios"
  on public.usage_counters for select using ((select auth.uid()) = user_id);


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0003_storage.sql
-- ===========================================================================
-- 0003 — Storage
--
-- Cuatro buckets, todos PRIVADOS. Las fotos de ropa de una persona son datos
-- personales (PLAN.md §37): nada es público por defecto y el acceso se hace
-- siempre con signed URL de caducidad corta.
--
-- Convención de rutas, idéntica en los cuatro buckets:
--     {user_id}/{lo que sea}
-- La primera carpeta ES el user_id, y las políticas lo comprueban. Sin esa
-- convención no hay forma de aislar a los usuarios dentro de un bucket.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-outfit-photos', 'user-outfit-photos', false, 10485760,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('clothing-images',    'clothing-images',    false,  5242880,
     array['image/jpeg','image/png','image/webp']),
  ('generated-images',   'generated-images',   false, 10485760,
     array['image/jpeg','image/png','image/webp']),
  ('avatars',            'avatars',            false,  2097152,
     array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- Políticas: la primera carpeta de la ruta debe ser el uid del usuario.
-- `storage.foldername(name)` devuelve el array de carpetas; [1] es la primera.
-- ---------------------------------------------------------------------------

create policy "storage: leer los propios archivos"
  on storage.objects for select
  using (
    bucket_id in ('user-outfit-photos','clothing-images','generated-images','avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: subir a la propia carpeta"
  on storage.objects for insert
  with check (
    bucket_id in ('user-outfit-photos','clothing-images','generated-images','avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: actualizar los propios archivos"
  on storage.objects for update
  using (
    bucket_id in ('user-outfit-photos','clothing-images','generated-images','avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: borrar los propios archivos"
  on storage.objects for delete
  using (
    bucket_id in ('user-outfit-photos','clothing-images','generated-images','avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0004_functions.sql
-- ===========================================================================
-- 0004 — Funciones
-- ===========================================================================

/*
 * Incremento atómico de un contador de uso.
 *
 * Hacerlo con SELECT + UPDATE desde la aplicación abre una condición de carrera:
 * dos peticiones simultáneas leerían el mismo valor y una de las dos se perdería,
 * que es justo como se salta un límite. `on conflict do update` lo resuelve en
 * una sola sentencia.
 *
 * SECURITY DEFINER + revoke: solo el service role puede llamarla, nunca el usuario.
 */
create or replace function public.increment_usage(
  p_user_id    uuid,
  p_period_key text,
  p_metric     text,
  p_delta      integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.usage_counters (user_id, period_key, metric, count, updated_at)
  values (p_user_id, p_period_key, p_metric, p_delta, now())
  on conflict (user_id, period_key, metric)
  do update set count = public.usage_counters.count + p_delta,
                updated_at = now()
  returning count into new_count;

  return new_count;
end;
$$;

revoke all on function public.increment_usage(uuid, text, text, integer) from public;
revoke all on function public.increment_usage(uuid, text, text, integer) from anon;
revoke all on function public.increment_usage(uuid, text, text, integer) from authenticated;


/*
 * Borrado de cuenta.
 *
 * Todo cuelga de auth.users con `on delete cascade`, así que borrar el usuario
 * limpia la base de datos entera sin dejar huérfanos (PLAN.md §37).
 * Lo que NO borra es Storage: los archivos hay que eliminarlos aparte, desde el
 * código, antes de llamar aquí. Queda anotado para no olvidarlo en la Fase 8.
 */
comment on table public.profiles is
  'Al borrar una cuenta: primero vaciar los buckets de Storage del usuario, después borrar auth.users (el resto va en cascada).';


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0005_usage_and_limits.sql
-- ===========================================================================
-- 0005 — Agregación de consumo y limpieza
-- ===========================================================================

/*
 * Resumen de uso de IA, agregado en la base de datos.
 *
 * Antes se traían las filas y se sumaban en memoria, que es correcto con pocos
 * registros y absurdo cuando `ai_usage` crezca: no tiene sentido mover diez mil
 * filas por la red para devolver cuatro números.
 *
 * SECURITY DEFINER con los permisos revocados: solo el service role. Un usuario
 * no debe poder consultar el gasto agregado de otro, ni el global.
 */
create or replace function public.ai_usage_summary(
  p_user_id   uuid default null,
  p_from      timestamptz default null,
  p_before    timestamptz default null,
  p_operation text default null
)
returns table (
  calls         bigint,
  cost_usd      numeric,
  input_tokens  bigint,
  output_tokens bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*)                                    as calls,
    coalesce(sum(estimated_cost_usd), 0)        as cost_usd,
    coalesce(sum(input_tokens), 0)              as input_tokens,
    coalesce(sum(output_tokens), 0)             as output_tokens
  from public.ai_usage
  where (p_user_id   is null or user_id   = p_user_id)
    and (p_from      is null or created_at >= p_from)
    and (p_before    is null or created_at <  p_before)
    and (p_operation is null or operation = p_operation);
$$;

revoke all on function public.ai_usage_summary(uuid, timestamptz, timestamptz, text) from public;
revoke all on function public.ai_usage_summary(uuid, timestamptz, timestamptz, text) from anon;
revoke all on function public.ai_usage_summary(uuid, timestamptz, timestamptz, text) from authenticated;


/*
 * Índice para el control de ráfagas.
 *
 * El limitador guarda sus cubos en `usage_counters` con claves de periodo del
 * tipo `rate:1758283980`. Se limpian aparte, y este índice hace barato encontrarlos.
 */
create index if not exists usage_counters_rate_idx
  on public.usage_counters (period_key)
  where period_key like 'rate:%';


/*
 * Limpieza de cubos de ráfaga caducados.
 *
 * Sin esto, `usage_counters` acumularía una fila por usuario y minuto para
 * siempre. Se puede llamar desde un cron de Supabase, o sin más de vez en cuando.
 */
create or replace function public.purge_rate_buckets(p_older_than interval default '2 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.usage_counters
  where period_key like 'rate:%'
    and updated_at < now() - p_older_than;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_rate_buckets(interval) from public;
revoke all on function public.purge_rate_buckets(interval) from anon;
revoke all on function public.purge_rate_buckets(interval) from authenticated;


-- ---------------------------------------------------------------------------
-- Nota sobre el borrado de cuenta
--
-- Borrar de auth.users arrastra en cascada todas las tablas de este esquema,
-- pero NO toca Storage: los archivos quedarían huérfanos ocupando espacio y,
-- lo que es peor, conteniendo fotos de una persona que pidió irse.
--
-- Por eso el borrado se hace desde la aplicación (lib/account/delete.ts), que
-- vacía los cuatro buckets ANTES de borrar el usuario.
-- ---------------------------------------------------------------------------
comment on function public.purge_rate_buckets(interval) is
  'Limpieza de cubos del limitador de ráfagas. Conviene llamarla a diario.';

