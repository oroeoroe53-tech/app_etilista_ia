-- ===========================================================================
-- 0017 — La referencia de la prenda
--
-- "Referencia" no es la marca: es el código que la prenda lleva en su etiqueta
-- y que, escrito en el buscador de la tienda, lleva a ESA prenda y no a una
-- parecida. Es lo que se pide cuando una amiga pregunta de dónde es algo, y es
-- lo único de aquí que sobrevive a que la tienda retire el producto.
--
-- Notas de diseño:
--
--  · Columnas en `clothing_items`, no tabla aparte. La relación sería 1:1
--    siempre, así que un `join` no compraría nada; y lo que sí compra esto es
--    que la referencia hereda tal cual los permisos de la prenda. No hay
--    política de RLS nueva que escribir, y por tanto no hay una manera nueva de
--    que se filtre el armario de nadie. Ver el aviso de `0010_prestamos.sql`
--    sobre por qué abrir `clothing_items` a terceros rompería la aplicación.
--
--  · Todo es opcional. Una prenda sin referencia es el caso normal: se
--    fotografía la ropa que ya está en el armario, sin etiqueta y sin recibo.
--
--  · El precio se guarda en céntimos y es el que se pagó, no el actual. Es un
--    dato del historial de la persona, no un escaparate.
--
--  · `reference_source` dice de dónde salió cada ficha, porque no valen lo
--    mismo: lo que leyó una máquina de una etiqueta torcida se revisa, lo que
--    escribió la persona no.
--
--  · La foto de la etiqueta no se guarda en ninguna parte. Se lee, rellena
--    estos campos y se descarta, igual que se hace con los selfies del
--    onboarding (`lib/onboarding/retention.ts`).
-- ===========================================================================

alter table public.clothing_items
  add column brand            text,
  add column product_name     text,
  add column reference_code   text,
  add column brand_color      text,
  add column size             text,
  add column price_cents      integer,
  add column bought_at        date,
  add column source_url       text,
  add column reference_source text;

alter table public.clothing_items
  add constraint clothing_items_price_cents_check
    check (price_cents is null or price_cents >= 0),
  add constraint clothing_items_reference_source_check
    check (reference_source is null
           or reference_source in ('tag', 'link', 'manual'));

comment on column public.clothing_items.reference_code is
  'El código de la etiqueta, tal y como lo lleva impreso. Sin normalizar: cada marca usa su formato y lo que la persona pega tiene que poder volver a leerse.';

comment on column public.clothing_items.brand_color is
  'El nombre que le da la marca al color ("arena"), no el de la taxonomia ("beige"). El mismo modelo existe en seis colores y sin esto la referencia no identifica nada.';
