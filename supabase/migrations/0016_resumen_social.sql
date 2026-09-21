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
