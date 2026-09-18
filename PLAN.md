# FASE 0 — Plan técnico

**AI Personal Stylist** · PWA mobile-first

> Documento de decisiones **previo a la implementación**. Requiere aprobación antes de la Fase 1.
> Fecha: 2026-09-18

---

## 0. Estado del proyecto

Carpeta vacía. Proyecto nuevo, sin código previo, sin git inicializado.
Entorno verificado: Windows 11 · Node v24.21.0 · npm 11.19.0 · git 2.55.0.

---

## 1. Resumen de la arquitectura

```
                 ┌──────────────────────────────┐
   Móvil (PWA)   │  Next.js App Router (RSC)    │
   ───────────►  │  React 19 · Tailwind         │
                 │  Serwist (service worker)    │
                 └──────────┬───────────────────┘
                            │  Server Actions + Route Handlers
                            │  (TODA clave secreta vive aquí)
                 ┌──────────▼───────────────────┐
                 │  lib/  (dominio, sin IA)     │
                 │  wardrobe · outfits · style  │
                 │  entitlements · usage        │
                 └──────────┬───────────┬───────┘
                            │           │
                 ┌──────────▼──┐   ┌────▼──────────────┐
                 │  Supabase   │   │   AI Router       │
                 │  Postgres   │   │  vision/stylist/  │
                 │  Auth · RLS │   │  image            │
                 │  Storage    │   └────┬──────┬───────┘
                 └─────────────┘        │      │
                                   Gemini   OpenAI   Mock
```

**Principio rector:** el motor de outfits es 100 % determinista. La IA solo entra donde hay
píxeles que interpretar o lenguaje que redactar. Ver §6.

---

## 2. Stack y versiones

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Next.js (App Router)** + React 19 + TypeScript strict | Pedido. Server Actions eliminan la mitad de las API routes. |
| Estilos | **Tailwind CSS v4** | Pedido. v4 no necesita `tailwind.config.js` para lo básico. |
| PWA | **`@serwist/next`** | `next-pwa` está prácticamente sin mantenimiento y encaja mal con App Router. Serwist es su sucesor mantenido. **Desvío del doc, justificado.** |
| DB / Auth / Storage | **Supabase** con `@supabase/ssr` | Pedido. `@supabase/ssr` es el paquete correcto hoy; `auth-helpers` está deprecado. |
| Validación | **Zod** | Valida respuestas de IA, formularios y variables de entorno con un solo lenguaje. |
| Imágenes (servidor) | **sharp** | Recorte de prendas por bounding box + recompresión. |
| Imágenes (cliente) | Canvas nativo | Sin dependencia externa; reduce antes de subir. |
| Clima | **Open-Meteo** | Gratis, sin API key, sin registro, sin tarjeta. Mejor que OpenWeather para este caso. |
| Tests | **Vitest** | Rápido, TypeScript nativo, sin configuración pesada. |
| Deploy | **Vercel** | Pedido. |

**No entra:** Redux/Zustand (el estado de servidor lo llevan RSC + `useOptimistic`), ORM
(el cliente de Supabase basta), librería de componentes (el look premium exige CSS propio),
Playwright en el MVP.

---

## 3. Esquema de base de datos

### 3.1 Desvíos respecto al documento (requieren tu visto bueno)

**a) `clothing_item_attributes` — eliminada.**
El documento la plantea como tabla aparte, lo que es un modelo EAV (entidad-atributo-valor).
Filtrar "camisetas negras oversized de invierno" en EAV requiere tres joins y no indexa bien.
**Propuesta:** columnas tipadas en `clothing_items` para lo que se filtra, más una columna
`attributes jsonb` para la cola larga que la IA devuelva y aún no tenga columna propia.
Más simple, más rápido, y sigue siendo extensible.

**b) `usage_limits` — no es una tabla.**
Los límites son configuración, no datos. Si viven en la base de datos, cambiar el plan Free
exige una migración. **Propuesta:** límites en `lib/subscriptions/plans.ts` (un solo archivo;
el §28 pide centralizar), y en la base de datos solo `usage_counters` con el consumo real.

**c) `style_preferences` / `user_preferences` — se separan por naturaleza, no por tema.**

- `style_profile`: pesos **aprendidos** por el sistema (internos; el usuario no los edita).
- `user_preferences`: ajustes **declarados** por el usuario (colores vetados, formalidad por
  defecto, ciudad, unidades). El usuario sí los edita.

Son dos cosas distintas con dos ciclos de vida distintos. Mezclarlas provoca que el
aprendizaje automático pise lo que el usuario dijo explícitamente.

**d) Borrado lógico en `clothing_items`.**
`deleted_at` en lugar de `DELETE` físico: el historial (`wear_history`) y los outfits pasados
no deben quedar huérfanos (el §37 lo pide explícitamente). El borrado real de cuenta sí es
cascada completa.

### 3.2 Tablas

```
profiles            (id→auth.users, display_name, avatar_path, onboarding_stage, created_at)

clothing_items      (id, user_id, category, subcategory,
                     primary_color, secondary_colors[], pattern, fit, material,
                     styles[], seasons[], formality 1..5, warmth 1..5,
                     image_path, source, is_available, condition, notes,
                     attributes jsonb, ai_confidence, user_verified,
                     times_worn, last_worn_at,
                     created_at, updated_at, deleted_at)

outfit_photos       (id, user_id, storage_path, optimized_path, width, height,
                     analysis_status, analysis_error, analyzed_at, created_at)

detected_items      (id, photo_id, user_id, raw jsonb, bbox jsonb,
                     clothing_item_id?, match_confidence, match_status, created_at)

outfits             (id, user_id, source, context jsonb,
                     score, score_breakdown jsonb, explanation, created_at)

outfit_items        (outfit_id, clothing_item_id, role)          PK compuesta

outfit_feedback     (id, user_id, outfit_id, reaction, reason, created_at)

style_profile       (user_id PK, style_weights jsonb, color_weights jsonb,
                     fit_weights jsonb, formality_bias, signal_count, updated_at)

user_preferences    (user_id PK, disliked_colors[], never_combine jsonb,
                     default_formality, units, city, lat, lon, updated_at)

wear_history        (id, user_id, outfit_id?, clothing_item_id, worn_on,
                     occasion, source, created_at)

ai_usage            (id, user_id, provider, model, operation,
                     input_tokens, output_tokens, image_count,
                     estimated_cost_usd, latency_ms, status, error_code, created_at)

subscriptions       (user_id PK, plan, status, current_period_end,
                     provider, provider_customer_id, updated_at)

usage_counters      (user_id, period_key, metric, count)         PK compuesta
```

**Por qué `detected_items` sobrevive:** guarda la salida cruda de la IA por foto. Si mañana
mejoro el algoritmo de deduplicación, lo vuelvo a ejecutar **sin repetir ni una llamada de
visión**. Es la aplicación directa del §41.3 ("¿podemos hacerlo una sola vez y guardarlo?").

### 3.3 Índices

- `clothing_items(user_id, deleted_at, category)` · `clothing_items(user_id, last_worn_at)`
- `wear_history(user_id, worn_on DESC)` · `detected_items(photo_id)`
- `ai_usage(user_id, created_at DESC)` · `outfit_feedback(user_id, created_at DESC)`

### 3.4 RLS

RLS activo en **todas** las tablas. Política uniforme `user_id = auth.uid()`.

- `ai_usage` y `usage_counters`: lectura del propio usuario, **escritura solo service role**.
  Si el cliente pudiera escribir ahí, podría falsear su consumo.
- Storage: buckets **privados**, política por prefijo `{user_id}/…`, acceso vía signed URL
  con caducidad corta.

---

## 4. Estructura de carpetas

```
app/
  (auth)/        login · register
  (app)/         inicio · armario · outfits · estilo · perfil
  onboarding/
  api/           ai/analyze · ai/status · weather · cron/
components/
  ui/            primitivos propios (Button, Sheet, Chip, Skeleton)
  wardrobe/  outfits/  onboarding/  swipe/
lib/
  ai/
    router.ts               ← ai.vision / ai.stylist / ai.image
    types.ts                ← VisionProvider, StylistProvider, ImageGenerationProvider
    schemas/                ← Zod: contrato de salida de los modelos
    providers/  gemini/  openai/  mock/
    usage.ts  pricing.ts  repair.ts
  wardrobe/      dedup.ts  normalize.ts  taxonomy.ts
  outfits/       filters.ts  candidates.ts  scoring.ts  diversity.ts  weights.ts
  style/         profile.ts  signals.ts  weights.ts
  weather/  subscriptions/  usage/  storage/  supabase/  utils/
supabase/
  migrations/  seed/
tests/
docs/            ARCHITECTURE.md  AI.md  DATABASE.md  ENVIRONMENT.md  DEPLOYMENT.md
```

**Regla dura:** `lib/outfits` **no puede importar** `lib/ai`. El motor es determinista por
construcción, no por disciplina. Se verifica con un test automático.

---

## 5. AI Router

```ts
interface VisionProvider {
  analyzeOutfitBatch(images: ImageInput[], opts): Promise<VisionResult>
  analyzeSingleItem(image: ImageInput, opts): Promise<DetectedItem>
}
interface StylistProvider          { explainOutfits(input): Promise<string[]> }
interface ImageGenerationProvider  { generateTryOn(input): Promise<GeneratedImage> }
```

El router resuelve el proveedor **por operación**, no globalmente:

```
AI_MODE=mock|production

AI_VISION_PROVIDER=gemini     AI_VISION_MODEL=<configurable>
AI_STYLIST_PROVIDER=gemini    AI_STYLIST_MODEL=<configurable>
AI_IMAGE_PROVIDER=gemini      AI_IMAGE_MODEL=<configurable>
```

Ningún nombre de modelo aparece escrito en el código. Cambiar de Gemini a OpenAI para visión
es cambiar una variable de entorno.

El router hace, en una sola capa y para todos los proveedores: medir latencia, registrar en
`ai_usage`, calcular coste con la tabla de `pricing.ts`, validar con Zod, reparar JSON
inválido, aplicar un reintento y hacer fallback al proveedor secundario.
Los providers solo hablan con su API y nada más.

---

## 6. Flujo de IA y control de coste

### Dónde SÍ se llama a la IA

| Operación | Cuándo | Llamadas |
|---|---|---|
| `vision.analyzeOutfitBatch` | Una vez, al terminar el onboarding | **1** |
| `vision.analyzeSingleItem` | Solo si el usuario fotografía una prenda suelta | 1 por prenda, opcional |
| `stylist.explainOutfits` | Solo en "¿Qué me pongo?", una llamada para los 3 looks | 1, cacheada |

### Dónde NO se llama jamás

Motor de outfits · filtros duros · scoring · diversidad · swipe · actualización del perfil de
estilo · clima · límites · entitlements · armario · historial · CRUD.

### Decisión clave: **una sola llamada para las 6 fotos**

El documento (§12–13) sugiere analizar foto a foto y deduplicar después. Es la opción cara y
la menos precisa: seis llamadas, y el modelo nunca ve dos fotos a la vez, así que reconocer
"esta es la misma camiseta negra" queda en manos de un comparador de atributos que confundirá
tres camisetas negras distintas con una sola.

**Propuesta:** enviar las seis imágenes comprimidas en **una única petición**, pidiendo al
modelo que devuelva prendas con un `garment_group` estable y el `photo_index` donde aparece
cada una. El modelo hace la correferencia viendo las imágenes juntas, que es exactamente la
tarea en la que es bueno.

Resultado: **1 llamada en lugar de 6**, mejor deduplicación, y el paso de dedup por código
pasa a ser una red de seguridad (confirmar o separar) en vez del mecanismo principal.

### Decisión: las fotos de prendas salen gratis

El modelo devuelve `bbox` por prenda. Recorto con `sharp` sobre la foto subida. El armario
tiene imagen de cada prenda **sin una sola llamada extra y sin generación de imágenes**.

### Decisión: el motor elige, la IA solo narra

Sin reranking por LLM en el MVP. El motor determinista selecciona los tres looks; una llamada
de texto barata redacta las tres explicaciones y se guarda en `outfits.explanation`. Si falla,
se muestran los looks sin explicación. Cumple §24, §35 y §42 a la vez.

### Compresión

- **Cliente:** lado largo → 1280 px, JPEG calidad 0.82, se descarta el EXIF (que incluye
  **geolocalización** — relevante para el §37).
- **Servidor:** copia a 768 px para el payload de IA.

**Punto a decidir:** el §12 pide guardar el original. Guardar un JPEG de 12 MP por foto cuesta
almacenamiento y no aporta nada: el recorte de prendas se hace igual de bien sobre 1280 px.
**Recomiendo guardar el de 1280 px como "original".** Si prefieres conservar el archivo
íntegro, se hace — pero conviene saber que es una decisión de coste, no técnica.

### Coste estimado por usuario

Onboarding ≈ 1 llamada de visión con seis imágenes pequeñas. Uso diario ≈ 0–1 llamadas de
texto cortas. El coste recurrente por usuario activo tiende a cero porque el motor no usa IA.

Las cifras exactas por modelo van en `lib/ai/pricing.ts`, versionadas, y las confirmo contra
la documentación oficial del proveedor en la Fase 1 — no las invento aquí.

---

## 7. APIs externas necesarias

| Servicio | Obligatorio | Coste | Clave |
|---|---|---|---|
| Supabase | Sí | Free tier suficiente | anon (público) + service role (solo servidor) |
| Gemini | Solo con `AI_MODE=production` | Por uso | `GEMINI_API_KEY` (solo servidor) |
| OpenAI | No — fallback | Por uso | `OPENAI_API_KEY` (solo servidor) |
| Open-Meteo | No — hay entrada manual | **Gratis, sin clave** | — |
| Vercel | Para desplegar | Free tier | — |

**Con `AI_MODE=mock` se desarrollan y prueban las Fases 1–8 completas sin ninguna clave de IA.**

---

## 8. Free / Pro

Un único archivo, `lib/subscriptions/plans.ts`:

```ts
export const PLANS = {
  free: { wardrobeItems: 40,  onboardingPhotos: 6,  aiAnalysesPerMonth: 5,
          outfitRequestsPerDay: 10,  swipesPerDay: 100,  tryOnPerMonth: 0 },
  pro:  { wardrobeItems: 300, onboardingPhotos: 20, aiAnalysesPerMonth: 60,
          outfitRequestsPerDay: 100, swipesPerDay: 500, tryOnPerMonth: 20 },
}
```

Cifras de partida, ajustables en un solo sitio. Ningún plan es "ilimitado": todo tiene techo
técnico (§28).

Una sola función de decisión, usada por servidor y UI:

```ts
checkEntitlement(userId, 'analyze_outfit') → { allowed, remaining, limit, reason? }
```

La UI no reimplementa la lógica: consume el resultado para decidir si muestra el botón activo,
atenuado o con invitación a Pro. La comprobación real se hace **siempre en servidor** antes de
gastar dinero (§30).

Stripe (Fase 9) solo rellenará `subscriptions.plan`. Nada más de la aplicación cambia.

---

## 9. Riesgos técnicos identificados

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| 1 | **Deduplicación de prendas.** Tres camisetas negras parecidas: ¿una o tres? Es el problema más difícil del producto. | Alta | Correferencia en una sola llamada (§6) + umbral de confianza + pregunta al usuario en la zona gris. Nunca fusionar en silencio por debajo del umbral. |
| 2 | **Timeout de Vercel.** Analizar seis fotos puede tardar 20–40 s; el límite por defecto es menor. Una petición bloqueante fallará en producción. | Alta | Subida → fila `outfit_photos` en `pending` → job → la UI consulta el estado con progreso. Nunca una request síncrona larga. |
| 3 | **Explosión combinatoria.** 60 prendas → decenas de miles de combinaciones. | Media | Filtros duros primero, tope de candidatos por categoría, muestreo con semilla, corte a N. Es código, pero hay que diseñarlo, no improvisarlo. |
| 4 | **Arranque en frío.** Seis fotos pueden dar 15 prendas → pocos outfits posibles y repetitivos. | Media | Flujo "creo que faltan prendas": alta rápida de básicos tras el onboarding + relajación progresiva de filtros cuando hay poco stock. |
| 5 | **`node_modules` dentro de OneDrive.** Provoca bloqueos de archivo, errores `EPERM` y sincronización de decenas de miles de ficheros. | Media | Excluir `node_modules` y `.next` de la sincronización de OneDrive (se explica en el README). Alternativa más limpia: mover el proyecto a `C:\dev\`. Decisión tuya. |
| 6 | **RLS y políticas de Storage** son fáciles de escribir mal de forma sutil. | Alta | Script de test con dos usuarios reales que intenta cruzar datos y **debe** fallar. Test automático, no inspección visual. |
| 7 | **Calidad de visión** en selfies de espejo, poca luz o prendas tapadas. | Media | El modelo devuelve `confidence`; por debajo del umbral la prenda entra como "por confirmar", ni se descarta ni se da por buena. |
| 8 | **PWA en iOS:** sin instalación automática, almacenamiento evictable. | Baja | Instrucción explícita "Compartir → Añadir a pantalla de inicio". Nada crítico en caché local; la base de datos es la fuente de verdad. |

---

## 10. Fases y orden de ejecución

| Fase | Entregable | ¿Necesita claves? |
|---|---|---|
| **1** | Proyecto, Tailwind, PWA, Supabase, Auth, migraciones + RLS, Storage, AI Router, mocks, `.env.example` | Supabase |
| **2** | Onboarding: subida, compresión, job de análisis, parseo validado, dedup, armario inicial, recorte de prendas | No (mock) |
| **3** | Armario: grid, detalle, edición, alta manual, filtros | No |
| **4** | Perfil de estilo: señales y pesos deterministas | No |
| **5** | Motor: filtros duros, candidatos, scoring, diversidad | No |
| **6** | "¿Qué me pongo?": contexto, clima, tres looks, explicación | No (mock) |
| **7** | Swipe, feedback, aprendizaje | No |
| **8** | Límites, entitlements, rate limiting, `ai_usage`, caching, observabilidad, documentación | No |
| **9** | Stripe | Posterior |
| **10** | Virtual try-on | Posterior |

Al final de cada fase: se ejecuta, se pasan sus tests, y paras a revisar antes de la siguiente.
El estado vivo de cada fase se registra en `PROGRESS.md`.

---

## 11. Lo que necesito de ti para arrancar la Fase 1

1. **Aprobación de este plan**, con los desvíos de §3.1 y §6 (o dime cuáles rechazas).
2. **Proyecto de Supabase creado** → `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.
   Yo escribo las migraciones; las aplicas tú (o me dejas usar la CLI de Supabase si la tienes
   enlazada).
3. **Decisión sobre `node_modules` en OneDrive** (riesgo 5).
4. **Decisión sobre guardar o no el original de 12 MP** (§6).

Las claves de Gemini y OpenAI **no hacen falta todavía**. Las fases 1–8 corren en `AI_MODE=mock`.
