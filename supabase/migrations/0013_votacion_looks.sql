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
