# Base de datos

Postgres en Supabase. La base de datos es la fuente de verdad; la caché del
navegador sirve para que vaya rápido, nunca para sustituirla.

## Migraciones

Se ejecutan en orden desde el editor SQL de Supabase:

| Archivo | Contenido |
|---|---|
| `0001_init.sql` | Tablas, índices, trigger de alta de usuario |
| `0002_rls.sql` | Row Level Security |
| `0003_storage.sql` | Buckets privados y políticas |
| `0004_functions.sql` | Contador de uso atómico |

---

## Tablas

### Armario

**`clothing_items`** — una prenda.

Columnas tipadas para lo que se filtra (categoría, color, patrón, fit, material,
estilos, temporadas, formalidad, abrigo) más `attributes jsonb` para la cola larga
que devuelva la IA y todavía no tenga columna propia.

> **Por qué no hay tabla de atributos.** El planteamiento original tenía una
> tabla `clothing_item_attributes`, que es un modelo EAV. Filtrar "camisetas
> negras oversized de invierno" en EAV necesita tres joins y no indexa bien.
> Columnas + jsonb es más simple, más rápido y sigue siendo extensible.

`deleted_at` en lugar de borrado físico: el historial y los outfits pasados no
deben quedar huérfanos.

`warmth` (1–5) lo usa el filtro de clima; `formality` (1–5), el de ocasión.

### Onboarding

**`outfit_photos`** — cada foto subida, con su `analysis_status`. El estado existe
porque el análisis es asíncrono: la petición HTTP no espera a la IA.

**`detected_items`** — la salida **cruda** del modelo, antes de decidir qué es
prenda nueva y qué es repetición.

> Se guarda a propósito. Si mañana mejora el algoritmo de deduplicación, se
> reejecuta sobre estas filas **sin repetir ni una llamada de visión**.

`garment_group` es el identificador que devuelve el modelo al ver todas las fotos
juntas: "estas tres detecciones son la misma prenda".

### Outfits

**`outfits`** + **`outfit_items`** — la combinación y sus piezas, con el rol que
ocupa cada una. `context` guarda con qué ocasión y clima se generó; `score_breakdown`,
por qué puntuó lo que puntuó.

**`outfit_feedback`** — las señales del swipe. `unique (user_id, outfit_id)`:
opinar dos veces sustituye, no acumula.

### Perfil

**`style_profile`** — pesos **aprendidos** (estilos, colores, fits). Internos: el
usuario no los edita ni los ve como números. `signal_count` dice cuántas señales
los sostienen, para que el motor confíe menos en un perfil recién nacido.

**`user_preferences`** — ajustes **declarados** por el usuario: colores vetados,
combinaciones prohibidas, formalidad por defecto, ciudad, unidades.

> Están separadas a propósito. Son dos cosas con ciclos de vida distintos, y
> mezclarlas haría que el aprendizaje automático pisara lo que la persona dijo
> explícitamente.

**`wear_history`** — qué se ha puesto y cuándo. Permite no repetir demasiado y
detectar cosas como "llevas diez días sin usar esta chaqueta".

### Negocio

**`ai_usage`** — toda llamada de IA, sin excepción, incluidos los errores.

**`subscriptions`** — qué plan tiene cada usuario. **Los límites del plan no están
aquí**: viven en `lib/subscriptions/plans.ts`, porque son configuración, no datos.
Si estuvieran en la base de datos, cambiar el plan Free exigiría una migración.

**`usage_counters`** — consumo real. `period_key` es el periodo ya resuelto:
`2026-09-18` para diario, `2026-09` para mensual, `all` para totales. Un solo
formato de tabla sirve para los tres casos.

---

## RLS

Activo en todas las tablas. Política uniforme `user_id = auth.uid()`.

Tres tablas son **de solo lectura** para el usuario, porque si pudiera escribirlas
se saltaría el modelo de negocio:

| Tabla | Si el usuario pudiera escribir… |
|---|---|
| `subscriptions` | se ascendería solo a Pro |
| `usage_counters` | pondría su consumo a cero |
| `ai_usage` | falsearía el registro de coste |

Solo las escribe el service role, que salta el RLS por definición.

`outfit_items` no tiene `user_id`: la pertenencia se comprueba a través del outfit
padre con un `exists`.

---

## Storage

Cuatro buckets, **todos privados**. Las fotos de ropa son datos personales: nada
es público por defecto y el acceso va siempre por signed URL de caducidad corta.

```
user-outfit-photos/{user_id}/…
clothing-images/{user_id}/…
generated-images/{user_id}/…
avatars/{user_id}/…
```

La primera carpeta **es** el `user_id`, y las políticas lo comprueban con
`storage.foldername(name)[1]`. Sin esa convención no hay aislamiento dentro de un
bucket, así que las rutas se construyen solo en `lib/storage/paths.ts`.

Cada bucket tiene límite de tamaño y lista de tipos MIME permitidos en el propio
Storage, además de la validación del cliente.

---

## Alta y baja de usuario

**Alta:** el trigger `handle_new_user` crea en una sola transacción las filas de
`profiles`, `subscriptions`, `style_profile` y `user_preferences`. Sin esto, media
aplicación tendría que hacer "si no existe la fila, créala" por todas partes.

**Baja:** todo cuelga de `auth.users` con `on delete cascade`, así que borrar el
usuario limpia la base de datos entera.

> ⚠️ Lo que **no** borra es Storage. Los archivos hay que eliminarlos antes, desde
> el código. Queda pendiente para la Fase 8.

---

## Contadores

`increment_usage(user_id, period_key, metric, delta)` hace el incremento en una
sola sentencia con `on conflict do update`.

Hacerlo con SELECT + UPDATE desde la aplicación abriría una condición de carrera:
dos peticiones simultáneas leerían el mismo valor y una se perdería, que es justo
como se salta un límite.

La función es `security definer` y tiene los permisos revocados para `anon` y
`authenticated`: solo la llama el service role.

---

## Tipos en TypeScript

De momento las consultas se tipan en el punto de uso. Cuando el proyecto de
Supabase esté en marcha conviene generar los tipos reales:

```bash
npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
```

Se hace entonces y no ahora, porque un tipo escrito a mano que se desvíe del
esquema es peor que no tener tipo.
