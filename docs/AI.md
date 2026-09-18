# IA

## La idea de fondo

La llamada de IA más barata es la que no se hace.

El motor que elige outfits **no usa IA en absoluto**: filtros, puntuación y
diversidad son código determinista. La IA interviene solo donde hay píxeles que
interpretar o una frase que redactar.

Esto no es una optimización posterior, es la forma del sistema. Hay un test
(`tests/architecture.test.ts`) que falla si alguien importa `lib/ai` dentro de
`lib/outfits` o `lib/style`.

---

## Dónde se llama a la IA

| Operación | Cuándo | Llamadas |
|---|---|---|
| `ai.vision.analyzeOutfitBatch` | Una vez, al terminar el onboarding | **1** |
| `ai.vision.analyzeSingleItem` | Solo si se fotografía una prenda suelta | 1, opcional |
| `ai.stylist.explainOutfits` | En "¿Qué me pongo?", una llamada para los 3 looks | 1, cacheable |
| `ai.image.generateTryOn` | Fase 10, bajo petición explícita | 1, con límite |

Y dónde **no** se llama nunca: motor de outfits, filtros, puntuación, diversidad,
swipe, perfil de estilo, clima, límites, permisos, armario, historial, CRUD.

---

## Una sola llamada para todas las fotos del onboarding

La decisión de diseño más importante del sistema.

Lo evidente sería analizar foto a foto y deduplicar después. Es seis veces más
caro **y peor**: el modelo nunca ve dos fotos a la vez, así que decidir si la
camiseta negra de la foto 1 es la misma que la de la foto 4 recae en un
comparador de atributos, que confundirá tres camisetas negras distintas con una.

En su lugar se envían las seis imágenes juntas y se le pide al modelo que agrupe
las repeticiones con un `garment_group` estable y liste en qué fotos aparece cada
prenda. La correferencia visual es justo lo que un modelo multimodal hace bien.

Consecuencia añadida: el modelo devuelve `bboxes`, y con `sharp` se recorta la
miniatura de cada prenda sobre la foto original. El armario tiene imagen de cada
prenda **sin una llamada extra y sin generar ninguna imagen**.

---

## El router

```
app  →  ai.vision.analyzeOutfitBatch(images, { userId })
             │
        AI ROUTER   ← valida, repara, reintenta, hace fallback, registra coste
             │
      ┌──────┴───────┬──────────┐
   Gemini         OpenAI      Mock
```

Los providers son deliberadamente tontos: reciben un prompt ya construido,
llaman a su API y devuelven texto crudo más el consumo de tokens. Todo lo
transversal vive una sola vez, en `lib/ai/router.ts`:

1. **Reparar** el JSON (`lib/ai/repair.ts`): quita ```json, texto alrededor y comas
   colgantes. Doce casos cubiertos por tests. Esto evita segundas llamadas.
2. **Validar** contra el schema Zod. Un modelo que inventa una categoría no
   contamina la base de datos.
3. **Reintentar** una vez, con un aviso explícito, solo si el fallo fue de formato.
4. **Fallback** al proveedor secundario si el fallo fue de red, clave o cuota
   (repetir el prompt no arregla una clave caducada).
5. **Registrar** en `ai_usage` pase lo que pase, incluidos los errores.

Añadir un proveedor nuevo es escribir unas sesenta líneas. No hay que tocar nada más.

---

## Cambiar de modelo o de proveedor

Ningún nombre de modelo está escrito en el código. Todo sale de `.env.local`:

```env
AI_VISION_PROVIDER=gemini
AI_VISION_MODEL=gemini-flash-lite-latest

AI_STYLIST_PROVIDER=openai
AI_STYLIST_MODEL=gpt-5-mini

# Secundario opcional: se usa cuando el primario falla por red, clave o cuota
AI_VISION_FALLBACK_PROVIDER=openai
AI_VISION_FALLBACK_MODEL=gpt-5-mini
```

El enrutado es **por operación**: se puede usar Gemini para visión y OpenAI para
texto, o al revés, sin tocar una línea de código.

---

## Modo mock

```env
AI_MODE=mock
```

Ignora la configuración de proveedores y usa los simulados. Los datos son
realistas a propósito, para que el desarrollo ejercite los casos difíciles:

- prendas que aparecen en varias fotos → deduplicación
- una prenda con confianza 0.52 → flujo de "¿es la misma camiseta?"
- categorías variadas → el motor puede componer outfits de verdad

Es determinista: la misma entrada da siempre la misma salida, así los tests no
dependen del azar.

---

## Control de coste

Cada llamada deja una fila en `ai_usage` con proveedor, modelo, operación,
tokens, coste estimado, latencia y estado. Se escribe con service role: el
usuario no puede tocar su propio registro de consumo.

```ts
import { usageByUser, usageByDay, usageByMonth, usageByOperation } from '@/lib/ai/usage'

await usageByUser(userId)              // { calls, costUsd, inputTokens, outputTokens }
await usageByDay('2026-09-18')         // global o por usuario
await usageByMonth('2026-09', userId)
await usageByOperation('vision.analyzeOutfitBatch')
```

### Precios

`lib/ai/pricing.ts`, en dólares por millón de tokens.

> ⚠️ Los valores actuales son **orientativos y están sin verificar**. Antes de
> pasar a `AI_MODE=production` hay que contrastarlos con la documentación oficial
> de cada proveedor y anotar la fecha. Un modelo que no esté en la tabla registra
> coste 0 y deja un aviso en los logs.

### Compresión

Antes de enviar nada a un modelo de visión:

- **Navegador**: lado largo a 1280 px, JPEG calidad 0.82. Ahorra datos del
  usuario, tiempo de función y almacenamiento. Efecto secundario deseado: al
  redibujar en un canvas se pierde el EXIF, que incluye la geolocalización.
- **Servidor**: copia a 768 px para el payload de IA.

Y no se vuelve a analizar una imagen que ya tiene resultado guardado: por eso
existe `detected_items`, que conserva la salida cruda del modelo para poder
reejecutar la deduplicación con un algoritmo mejor sin repetir ni una llamada.

---

## Cuando la IA falla

Nunca se deja al usuario en una pantalla rota.

| Falla | Qué pasa |
|---|---|
| Análisis de foto | "No hemos podido analizar esta foto. Inténtalo de nuevo." El resto del onboarding sigue. |
| Explicación del look | Se muestran los outfits **sin** frase. El motor ya los había elegido. |
| Proveedor entero | Fallback al secundario si está configurado. |
| Registro en `ai_usage` | Se avisa por log y se continúa: la contabilidad no tumba una función que ya ha funcionado. |
