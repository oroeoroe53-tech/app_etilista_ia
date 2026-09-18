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
