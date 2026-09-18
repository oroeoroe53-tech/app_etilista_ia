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
