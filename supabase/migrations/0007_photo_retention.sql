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
