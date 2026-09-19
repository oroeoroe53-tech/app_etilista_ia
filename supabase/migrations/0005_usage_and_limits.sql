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
