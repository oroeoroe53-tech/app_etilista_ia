# Arquitectura

## Principio

Un solo desarrollador tiene que poder mantener esto. Next.js + Supabase + Vercel
y nada más. Sin microservicios, sin colas, sin ORM, sin gestor de estado global.

La única regla estructural innegociable: **el motor de recomendación es
determinista**. La IA interpreta imágenes y redacta frases; no decide qué te pones.

---

## Capas

```
┌──────────────────────────────────────────┐
│  app/          rutas, Server Components  │
│                Server Actions            │
└───────────────┬──────────────────────────┘
                │  solo servidor: aquí viven los secretos
┌───────────────▼──────────────────────────┐
│  lib/          dominio                   │
│                                          │
│  wardrobe · outfits · style              │  ← sin IA, por test
│  subscriptions · usage · storage         │
└──────┬────────────────────────┬──────────┘
       │                        │
┌──────▼───────┐        ┌───────▼──────────┐
│  Supabase    │        │  AI Router       │
│  Postgres    │        │  vision/stylist/ │
│  Auth · RLS  │        │  image           │
│  Storage     │        └───────┬──────────┘
└──────────────┘           Gemini · OpenAI · Mock
```

### Reglas que el proyecto hace cumplir

`tests/architecture.test.ts` falla si:

- `lib/outfits` o `lib/style` importan `lib/ai`
- un componente con `'use client'` importa el cliente admin de Supabase
- un componente cliente menciona una variable de entorno secreta

No son convenciones escritas en un documento: son tests.

---

## Los tres clientes de Supabase

| Cliente | Dónde | Clave | RLS |
|---|---|---|---|
| `lib/supabase/client.ts` | navegador | anon | sí |
| `lib/supabase/server.ts` | RSC, actions, routes | anon | sí |
| `lib/supabase/admin.ts` | solo servidor | **service role** | **no** |

El cliente admin salta el RLS por completo. Se usa únicamente para lo que el
usuario no puede hacer por sí mismo: escribir `ai_usage` y `usage_counters`,
jobs de análisis y borrado de cuenta. Toda consulta hecha con él debe filtrar por
`user_id` a mano, porque no hay red de seguridad debajo.

---

## Sesión

`proxy.ts` (antes `middleware.ts`; Next 16 cambió la convención) refresca la
sesión en cada petición y redirige lo privado a `/login`.

El refresco tiene que ocurrir ahí porque los Server Components no pueden escribir
cookies. Si no, la sesión caducaría en silencio.

Dos detalles deliberados:

- Se usa `getUser()`, que valida el token contra Supabase, y no `getSession()`,
  que solo lee la cookie y por tanto es falsificable.
- Si Supabase no responde, se trata al visitante como anónimo en vez de devolver
  un 500 en todas las páginas a la vez.

---

## Permisos y planes

Todos los números de Free/Pro están en `lib/subscriptions/plans.ts` y en ningún
otro sitio. Cambiar el plan gratuito es editar un archivo, no migrar la base de datos.

Una sola función decide:

```ts
const check = await checkEntitlement(userId, 'analyze_outfit')
// { allowed, plan, used, limit, remaining, reason? }
```

La interfaz la consulta para saber si enseñar un botón activo, atenuado o con
invitación a Pro. El servidor la vuelve a consultar antes de gastar dinero. La
lógica no se duplica.

`consumeEntitlement` se llama **después** de que la operación haya salido bien: un
análisis que falló no debe gastarle el cupo a nadie.

El armario se cuenta sobre la tabla y no con un contador acumulado, para que
borrar una prenda libere hueco de verdad.

---

## Imágenes

1. El navegador reduce a 1280 px y recomprime. Se pierde el EXIF (y con él la
   geolocalización).
2. Se sube al bucket privado `user-outfit-photos/{user_id}/…`.
3. El servidor hace una copia a 768 px para el modelo de visión.
4. El modelo devuelve `bboxes`; `sharp` recorta la miniatura de cada prenda a
   `clothing-images/{user_id}/{item_id}.jpg`.

No se guarda el original de 12 MP: el recorte sale igual de bien sobre 1280 px y
el almacenamiento cuesta dinero.

---

## Análisis asíncrono

Analizar seis fotos tarda entre 20 y 40 segundos. Una petición HTTP bloqueante se
pasaría del límite de Vercel y fallaría en producción, no en local.

Por eso `outfit_photos.analysis_status` existe desde el primer día:

```
subir → filas en 'pending' → job → la interfaz consulta el estado con progreso
```

Nunca una request síncrona larga.

---

## PWA

`@serwist/next` en lugar de `next-pwa`, que está sin mantenimiento y encaja mal
con App Router.

El alcance del service worker es modesto a propósito: cachea el armazón para que
abra rápido y sirve `/offline` cuando no hay red. No se intenta que la aplicación
funcione entera sin conexión: el armario vive en la base de datos, y enseñar una
copia desincronizada sería peor que decir la verdad.

### Next 16 y Turbopack

Next 16 usa Turbopack por defecto; Serwist todavía aporta configuración de
webpack. La convivencia elegida:

- `npm run dev` → Turbopack (Serwist está desactivado en desarrollo)
- `npm run build` → webpack, que es lo que Serwist necesita

El `turbopack: {}` de `next.config.ts` es lo que le indica a Next que esto es
intencionado.

---

## Qué no hay, y por qué

| Ausente | Motivo |
|---|---|
| ORM | El cliente de Supabase basta y el SQL queda a la vista |
| Gestor de estado | RSC + Server Actions + `useOptimistic` cubren el caso |
| Librería de componentes | El aspecto de revista pide CSS propio |
| `clsx` / `tailwind-merge` | Ocho líneas en `lib/utils/cn.ts` |
| Librería de iconos | Son cinco iconos; están dibujados a mano |
| Machine learning propio | Reglas + puntuación + feedback primero; modelos cuando los datos lo justifiquen |
