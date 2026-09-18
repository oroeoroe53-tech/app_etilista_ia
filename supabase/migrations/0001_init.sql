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
