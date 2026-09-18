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
