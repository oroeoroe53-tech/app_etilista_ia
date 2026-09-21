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


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0006_funnel.sql
-- ===========================================================================
-- 0006 — Embudo: dónde se queda la gente
-- ===========================================================================

/*
 * Seis o siete momentos del recorrido, contados.
 *
 * Sin esto, publicitar la aplicación es tirar dinero a ciegas: si nadie llega
 * al armario no hay forma de saber si el problema es el anuncio, el registro,
 * las fotos o que simplemente no vuelven al día siguiente.
 *
 * Qué NO es esto:
 *
 *  · No es analítica de terceros. No hay Google, no hay cookies, no hay banner
 *    de consentimiento — que en una aplicación de moda es además feísimo.
 *  · No se guarda IP, ni navegador, ni pantalla, ni referente. Solo qué pasó,
 *    cuándo, y de quién si había sesión.
 *  · No lo lee la aplicación. Nadie ve esto salvo quien entra con el service
 *    role al editor SQL.
 *
 * `on delete set null`: cuando alguien borra su cuenta, sus eventos se quedan
 * sin dueño en vez de desaparecer. Los contadores históricos siguen siendo
 * ciertos y ya no apuntan a nadie, que es exactamente lo que hace falta.
 */

create table if not exists public.funnel_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  event      text not null,
  created_at timestamptz not null default now(),

  constraint funnel_events_event_check check (
    event in (
      'demo_viewed',      -- ha visto la demostración sin registrarse
      'install_viewed',   -- ha abierto las instrucciones de instalación
      'registered',       -- ha creado la cuenta
      'photos_uploaded',  -- ha subido las fotos del onboarding
      'analysis_done',    -- la IA terminó y ya tiene armario
      'first_proposal',   -- ha pedido "¿qué me pongo?"
      'opened_day'        -- ha abierto la aplicación un día cualquiera
    )
  )
);

create index if not exists funnel_events_event_time_idx
  on public.funnel_events (event, created_at desc);

create index if not exists funnel_events_user_idx
  on public.funnel_events (user_id, created_at desc);

/*
 * Cerrado a cal y canto.
 *
 * RLS activo y ni una sola política: con eso, `anon` y `authenticated` no
 * pueden leer ni escribir nada. Solo el service role, que salta el RLS, y que
 * vive únicamente en el servidor.
 */
alter table public.funnel_events enable row level security;

revoke all on public.funnel_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- La consulta que de verdad se mira
-- ---------------------------------------------------------------------------

/*
 * El embudo, en una tabla de siete filas.
 *
 * `personas` cuenta usuarios distintos, no eventos: alguien que pide diez
 * propuestas es una persona que llegó hasta ahí, no diez.
 *
 * Los eventos sin sesión (`demo_viewed`, `install_viewed`) no tienen usuario,
 * así que ahí lo que vale es `veces`.
 */
create or replace view public.funnel_summary as
select
  event,
  count(*)                       as veces,
  count(distinct user_id)        as personas,
  min(created_at)                as primera,
  max(created_at)                as ultima
from public.funnel_events
group by event;

revoke all on public.funnel_summary from anon, authenticated;

/*
 * Retención: cuántos días distintos ha abierto la aplicación cada persona.
 *
 * Es el número que más dice de todos. Una aplicación de vestirse que se usa un
 * día y no más no tiene un problema de captación, tiene otro.
 */
create or replace view public.funnel_retention as
select
  user_id,
  count(distinct created_at::date) as dias_abiertos,
  min(created_at)::date            as primer_dia,
  max(created_at)::date            as ultimo_dia
from public.funnel_events
where event = 'opened_day'
  and user_id is not null
group by user_id;

revoke all on public.funnel_retention from anon, authenticated;


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0007_photo_retention.sql
-- ===========================================================================
-- 0007 — Las fotos originales no se quedan para siempre
-- ===========================================================================

/*
 * Lo que se sube en el onboarding son fotos de una persona vestida: selfies de
 * espejo, fotos de un viaje, fotos con cara. Sirven para una cosa concreta
 * —que el modelo de visión lea qué prendas hay— y en cuanto eso ocurre, su
 * trabajo está hecho: de cada prenda queda su recorte, que es lo único que la
 * aplicación vuelve a mirar.
 *
 * Guardarlas indefinidamente después de eso no aporta nada al producto y sí
 * añade: superficie de exposición si algún día hay una brecha, una obligación
 * que explicar en el RGPD, y factura de almacenamiento.
 *
 * Así que se borran. Lo que se conserva es la **fila**, no la imagen: que hubo
 * un análisis, cuándo fue y qué se dedujo. Eso permite seguir explicando de
 * dónde salió cada prenda del armario sin conservar la cara de nadie.
 */

-- Al vaciar la foto, la ruta deja de apuntar a nada.
alter table public.outfit_photos
  alter column storage_path drop not null;

alter table public.outfit_photos
  add column if not exists purged_at timestamptz;

comment on column public.outfit_photos.purged_at is
  'Cuándo se borró la imagen original de Storage. La fila sobrevive; el archivo no.';

/*
 * Índice para encontrar rápido lo que queda por limpiar.
 *
 * Parcial: solo indexa las filas analizadas y todavía con archivo, que son las
 * únicas que la limpieza busca. Las demás no ocupan espacio en el índice.
 */
create index if not exists outfit_photos_pending_purge_idx
  on public.outfit_photos (user_id)
  where analysis_status = 'done' and purged_at is null;


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0008_votacion.sql
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


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0009_circulo.sql
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


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0010_prestamos.sql
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


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0011_eventos.sql
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


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0012_estilista.sql
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


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0013_votacion_looks.sql
-- ===========================================================================
-- 0013 — Votaciones con looks del motor
--
-- Hasta ahora, una votación eran fotos: te ponías las dos opciones, las
-- fotografiabas y preguntabas. Funciona, pero cuesta: hay que vestirse dos
-- veces antes de decidir qué ponerse.
--
-- El diseño propone lo contrario, y tiene razón: **que los monte el motor**.
-- Tres looks con la ropa que ya está en el armario, y tú solo eliges a quién se
-- lo preguntas. Cero fotos, cero vestirse dos veces, cero segundos de espera —
-- y, de regalo, cero fotos tuyas circulando por un grupo.
--
-- Las dos formas conviven. La foto sigue siendo la buena cuando lo que dudas
-- está en tus manos: dos vestidos en la tienda, o algo que el armario no sabe
-- que existe.
-- ===========================================================================

-- Una opción es UNA de las dos cosas, nunca las dos ni ninguna.
alter table public.poll_options
  alter column storage_path drop not null;

alter table public.poll_options
  add column if not exists outfit_id uuid references public.outfits(id) on delete cascade;

alter table public.poll_options
  add constraint poll_options_one_source
  check (
    (storage_path is not null and outfit_id is null)
    or (storage_path is null and outfit_id is not null)
  );

create index if not exists poll_options_outfit_idx on public.poll_options (outfit_id);

comment on column public.poll_options.outfit_id is
  'Look compuesto por el motor. Excluyente con storage_path: o es una foto, o es un look.';


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0014_feed.sql
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


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0015_retos_y_duelos.sql
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


-- >>>>>>>>>>>>>>>>>>>> supabase/migrations/0016_resumen_social.sql
-- ===========================================================================
-- 0016 — Un solo viaje para todo lo social
--
-- La portada y la pantalla Social preguntaban por separado: ¿tengo una votación
-- abierta?, ¿me han montado algún look?, ¿cuánta gente tengo en el círculo?,
-- ¿he publicado hoy?, ¿hay votaciones esperando mi voto?, ¿préstamos sin
-- contestar?
--
-- Seis preguntas son seis viajes de ida y vuelta a la base de datos, y en una
-- aplicación que se abre desde el móvil con datos, cada viaje se nota. Y se
-- notan **en serie**: la pantalla no aparece hasta que vuelve el último.
--
-- Esta función las contesta todas de una vez, dentro de Postgres, donde las
-- tablas están a cero milisegundos unas de otras.
--
-- `security definer` porque tiene que mirar filas de otras personas —los
-- nombres de quien te vota, quién ha publicado hoy— igual que hacía el código
-- de servidor. La diferencia es que aquí el alcance está escrito y acotado: se
-- devuelven nombres y recuentos, nunca fotos ni armarios.
-- ===========================================================================

create or replace function public.social_summary(viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  /*
   * La comprobación que sostiene todo lo demás.
   *
   * `security definer` salta el RLS, así que sin esto cualquiera podría pedir
   * el resumen de otra persona pasando su identificador. Se responde solo
   * sobre quien pregunta.
   */
  if viewer is null or viewer <> auth.uid() then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(

    -- Tu votación abierta, si la hay. Para la fila de la portada.
    'open_poll', (
      select jsonb_build_object(
               'token', p.token,
               'closes_at', p.closes_at,
               'votes', (select count(*) from poll_votes v where v.poll_id = p.id)
             )
        from polls p
       where p.owner_id = viewer
         and p.closes_at > now()
         and p.expires_at > now()
       order by p.closes_at
       limit 1
    ),

    -- Votaciones de tu círculo que esperan tu voto.
    'pending_votes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'token', p.token,
               'question', p.question,
               'closes_at', p.closes_at,
               'owner_name', coalesce(nullif(btrim(pr.display_name), ''), 'Alguien'),
               'options', (select count(*) from poll_options o where o.poll_id = p.id)
             ) order by p.closes_at)
        from polls p
        join connections c on c.friend_id = p.owner_id and c.user_id = viewer
        left join profiles pr on pr.id = p.owner_id
       where p.closes_at > now()
         and p.expires_at > now()
         and not exists (
           select 1 from poll_votes v
            where v.poll_id = p.id and v.voter_id = viewer
         )
    ), '[]'::jsonb),

    -- Looks que te han montado y no has visto.
    'unseen_looks', (
      select count(*) from styled_looks l
       where l.owner_id = viewer and l.seen_at is null
    ),

    -- Préstamos que te han pedido y no has contestado.
    'pending_loans', (
      select count(*) from loans l
       where l.owner_id = viewer and l.status = 'requested'
    ),

    -- Cuánta gente hay en tu círculo.
    'circle_count', (
      select count(*) from connections c where c.user_id = viewer
    ),

    -- ¿Has enseñado ya tu look de hoy?
    'shared_today', exists (
      select 1 from daily_shares d
       where d.user_id = viewer and d.shared_on = current_date
    ),

    -- Quién del círculo ha enseñado el suyo hoy. Nombres, no un número.
    'shared_names', coalesce((
      select jsonb_agg(coalesce(nullif(btrim(pr.display_name), ''), 'Alguien'))
        from daily_shares d
        join connections c on c.friend_id = d.user_id and c.user_id = viewer
        left join profiles pr on pr.id = d.user_id
       where d.shared_on = current_date
    ), '[]'::jsonb),

    -- Duelos que te toca contestar.
    'duels_to_answer', (
      select count(*) from duels d
       where d.opponent_id = viewer and d.status = 'pending'
    )

  ) into result;

  return result;
end;
$$;

revoke all on function public.social_summary(uuid) from public, anon;
grant execute on function public.social_summary(uuid) to authenticated;

comment on function public.social_summary(uuid) is
  'Todo lo social de una persona en una sola consulta. Solo contesta sobre quien pregunta.';

