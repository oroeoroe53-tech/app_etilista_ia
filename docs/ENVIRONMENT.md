# Variables de entorno

Copia `.env.example` a `.env.local` y rellena. `.env.local` está en `.gitignore`
y **nunca** debe subirse al repositorio.

La validación se hace con Zod en `lib/env.ts`. Es perezosa: el proyecto se puede
importar sin `.env.local` (para ejecutar tests, por ejemplo) y solo falla cuando
algo la usa de verdad, diciendo exactamente qué falta.

---

## Supabase

| Variable | Secreta | Dónde se coge |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **sí** | Project Settings → API |

Las dos primeras acaban en el bundle del navegador a propósito: están limitadas
por RLS y no pueden hacer nada que el usuario no pueda hacer.

`SUPABASE_SERVICE_ROLE_KEY` **salta el RLS por completo**. Si llega al navegador,
cualquiera puede leer los datos de cualquier usuario. `serverEnv()` lanza si se
la invoca desde el cliente, y hay un test que comprueba que ningún componente con
`'use client'` la menciona.

---

## Modo de IA

| Variable | Valores | Por defecto |
|---|---|---|
| `AI_MODE` | `mock` · `production` | `mock` |

`mock` por defecto es deliberado: arrancar el proyecto no debe costar dinero por
accidente.

---

## Enrutado de IA

El proveedor y el modelo se eligen **por operación**. Ningún nombre de modelo
está escrito en el código.

| Variable | Por defecto |
|---|---|
| `AI_VISION_PROVIDER` | `gemini` |
| `AI_VISION_MODEL` | `gemini-flash-lite-latest` |
| `AI_STYLIST_PROVIDER` | `gemini` |
| `AI_STYLIST_MODEL` | `gemini-flash-lite-latest` |
| `AI_IMAGE_PROVIDER` | `gemini` |
| `AI_IMAGE_MODEL` | `gemini-image-latest` |

### Proveedor secundario (opcional)

Si se define, el router lo intenta cuando el primario falla por red, clave o
cuota. Sin esto no hay fallback: el error sube a la aplicación, que lo gestiona.

```env
AI_VISION_FALLBACK_PROVIDER=openai
AI_VISION_FALLBACK_MODEL=gpt-5-mini
AI_STYLIST_FALLBACK_PROVIDER=openai
AI_STYLIST_FALLBACK_MODEL=gpt-5-mini
```

---

## Claves de IA

| Variable | Secreta | Cuándo hace falta |
|---|---|---|
| `GEMINI_API_KEY` | **sí** | Solo con `AI_MODE=production` |
| `OPENAI_API_KEY` | **sí** | Solo si se usa OpenAI como primario o fallback |

Ambas se usan exclusivamente desde el servidor. Si falta la que toca, el router
lanza `NO_API_KEY` con un mensaje claro en vez de un error de red confuso.

---

## Ejemplo mínimo para desarrollar

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
AI_MODE=mock
```

Con esto se construye y se prueba la aplicación entera sin gastar nada en IA.

---

## En Vercel

Las mismas variables se definen en **Project Settings → Environment Variables**.

Importante: las que no llevan `NEXT_PUBLIC_` no deben marcarse como expuestas al
navegador, y conviene tener valores distintos para Production y Preview si se usa
un proyecto de Supabase separado para pruebas.
