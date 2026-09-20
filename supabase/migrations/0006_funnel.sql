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
