import type { ZodType } from 'zod'
import { serverEnv } from '@/lib/env'
import { repairJson } from './repair'
import { estimateCostUsd, isPriceKnown } from './pricing'
import { recordAiUsage } from './usage'
import {
  AiError,
  type AiCallMeta,
  type AiOperation,
  type AiResult,
  type GeneratedImage,
  type ImageGenerationProvider,
  type ImageInput,
  type PromptSpec,
  type ProviderName,
  type StylistProvider,
  type VisionProvider,
} from './types'
import {
  outfitBatchAnalysisSchema,
  singleItemAnalysisSchema,
  type OutfitBatchAnalysis,
  type SingleItemAnalysis,
} from './schemas/vision'
import { outfitExplanationsSchema } from './schemas/stylist'
import { buildOutfitBatchPrompt, buildSingleItemPrompt } from './prompts/vision'
import {
  buildExplanationsPrompt,
  type ExplanationContext,
  type OutfitForExplanation,
} from './prompts/stylist'

import { mockImageProvider, mockStylistProvider, mockVisionProvider } from './providers/mock'
import {
  geminiImageProvider,
  geminiStylistProvider,
  geminiVisionProvider,
} from './providers/gemini'
import {
  openaiImageProvider,
  openaiStylistProvider,
  openaiVisionProvider,
} from './providers/openai'

/**
 * AI ROUTER
 *
 * La aplicación llama a `ai.vision.analyzeOutfitBatch(...)` y no sabe —ni debe
 * saber— qué proveedor hay detrás. Cambiar de Gemini a OpenAI es cambiar una
 * variable de entorno.
 *
 * Aquí, y solo aquí, viven las preocupaciones transversales:
 *   · validación del JSON contra el schema
 *   · reparación del JSON malformado, antes de gastar otra llamada
 *   · un reintento con aviso explícito si el schema no cuadra
 *   · fallback al proveedor secundario si el primario está caído
 *   · registro del coste en `ai_usage`, pase lo que pase
 */

// ---------------------------------------------------------------------------
// Resolución de proveedores
// ---------------------------------------------------------------------------

const VISION: Record<ProviderName, VisionProvider> = {
  gemini: geminiVisionProvider,
  openai: openaiVisionProvider,
  mock: mockVisionProvider,
}

const STYLIST: Record<ProviderName, StylistProvider> = {
  gemini: geminiStylistProvider,
  openai: openaiStylistProvider,
  mock: mockStylistProvider,
}

const IMAGE: Record<ProviderName, ImageGenerationProvider> = {
  gemini: geminiImageProvider,
  openai: openaiImageProvider,
  mock: mockImageProvider,
}

interface Target<P> {
  provider: P
  name: ProviderName
  model: string
}

/**
 * Devuelve la cadena de intentos: primario y, si está configurado, secundario.
 * En `AI_MODE=mock` siempre es el simulado, sin excepción: es lo que garantiza
 * que desarrollar no cueste dinero por accidente.
 */
function chain<P>(
  table: Record<ProviderName, P>,
  primaryName: ProviderName,
  primaryModel: string,
  fallbackName?: ProviderName,
  fallbackModel?: string,
): Target<P>[] {
  const env = serverEnv()
  if (env.AI_MODE === 'mock') {
    return [{ provider: table.mock, name: 'mock', model: 'mock' }]
  }

  const targets: Target<P>[] = [
    { provider: table[primaryName], name: primaryName, model: primaryModel },
  ]
  if (fallbackName && fallbackModel && fallbackName !== primaryName) {
    targets.push({ provider: table[fallbackName], name: fallbackName, model: fallbackModel })
  }
  return targets
}

function visionChain() {
  const e = serverEnv()
  return chain(
    VISION, e.AI_VISION_PROVIDER, e.AI_VISION_MODEL,
    e.AI_VISION_FALLBACK_PROVIDER, e.AI_VISION_FALLBACK_MODEL,
  )
}

function stylistChain() {
  const e = serverEnv()
  return chain(
    STYLIST, e.AI_STYLIST_PROVIDER, e.AI_STYLIST_MODEL,
    e.AI_STYLIST_FALLBACK_PROVIDER, e.AI_STYLIST_FALLBACK_MODEL,
  )
}

function imageChain() {
  const e = serverEnv()
  return chain(IMAGE, e.AI_IMAGE_PROVIDER, e.AI_IMAGE_MODEL)
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

interface CallOptions {
  /** Para imputar el coste. `null` en trabajos del sistema sin usuario. */
  userId: string | null
}

/** Aviso que se añade al reintentar cuando el modelo no respetó el formato. */
const RETRY_NUDGE =
  '\n\nTu respuesta anterior no era JSON válido con la forma pedida. ' +
  'Responde ÚNICAMENTE con el objeto JSON, sin markdown, sin explicaciones.'

async function runJson<T>(params: {
  operation: AiOperation
  spec: PromptSpec
  schema: ZodType<T>
  targets: Target<{ complete: (s: PromptSpec, m: string) => Promise<{ text: string; inputTokens?: number; outputTokens?: number }> }>[]
  userId: string | null
}): Promise<AiResult<T>> {
  const { operation, spec, schema, targets, userId } = params
  const imageCount = spec.images?.length ?? 0

  let lastError: AiError = new AiError('PROVIDER_ERROR', 'No se configuró ningún proveedor de IA.')

  for (let t = 0; t < targets.length; t++) {
    const target = targets[t]!
    const isFallback = t > 0

    // Dos intentos por proveedor: el segundo solo si el fallo fue de formato.
    for (let attempt = 0; attempt < 2; attempt++) {
      const promptSpec: PromptSpec =
        attempt === 0 ? spec : { ...spec, user: spec.user + RETRY_NUDGE }

      const startedAt = Date.now()
      let meta: AiCallMeta = {
        provider: target.name,
        model: target.model,
        operation,
        imageCount,
        latencyMs: 0,
        status: isFallback ? 'fallback' : 'ok',
      }

      try {
        const raw = await target.provider.complete(promptSpec, target.model)

        meta = {
          ...meta,
          latencyMs: Date.now() - startedAt,
          inputTokens: raw.inputTokens,
          outputTokens: raw.outputTokens,
          estimatedCostUsd: estimateCostUsd({
            provider: target.name,
            model: target.model,
            inputTokens: raw.inputTokens,
            outputTokens: raw.outputTokens,
            imageCount,
          }),
        }

        if (!isPriceKnown(target.name, target.model)) {
          console.warn(
            `[ai] modelo "${target.model}" sin precio en lib/ai/pricing.ts: el coste se registrará como 0.`,
          )
        }

        const parsedJson = repairJson(raw.text)
        if (parsedJson === null) {
          lastError = new AiError('INVALID_JSON', `${target.name} no devolvió JSON recuperable.`)
          await recordAiUsage(userId, { ...meta, status: 'error', errorCode: 'INVALID_JSON' })
          continue // reintento de formato
        }

        const validated = schema.safeParse(parsedJson)
        if (!validated.success) {
          lastError = new AiError(
            'SCHEMA_MISMATCH',
            `${target.name} devolvió JSON que no cumple el schema: ${validated.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join('.')} ${i.message}`)
              .join(' | ')}`,
          )
          await recordAiUsage(userId, { ...meta, status: 'error', errorCode: 'SCHEMA_MISMATCH' })
          continue // reintento de formato
        }

        await recordAiUsage(userId, meta)
        return { data: validated.data, meta }
      } catch (err) {
        const aiError =
          err instanceof AiError
            ? err
            : new AiError('PROVIDER_ERROR', err instanceof Error ? err.message : String(err), err)

        lastError = aiError
        await recordAiUsage(userId, {
          ...meta,
          latencyMs: Date.now() - startedAt,
          status: 'error',
          errorCode: aiError.code,
        })

        // Un fallo de red, de clave o de cuota no se arregla repitiendo el prompt:
        // se pasa directamente al siguiente proveedor.
        break
      }
    }
  }

  throw lastError
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export const ai = {
  vision: {
    /**
     * Analiza TODAS las fotos del onboarding en una sola llamada.
     * El modelo agrupa las prendas repetidas entre fotos: ahí está el ahorro
     * y también la calidad de la deduplicación (PLAN.md §6).
     */
    analyzeOutfitBatch(
      images: ImageInput[],
      opts: CallOptions,
    ): Promise<AiResult<OutfitBatchAnalysis>> {
      return runJson({
        operation: 'vision.analyzeOutfitBatch',
        spec: buildOutfitBatchPrompt(images),
        schema: outfitBatchAnalysisSchema,
        targets: visionChain(),
        userId: opts.userId,
      })
    },

    /** Foto de una prenda suelta, subida desde el armario. */
    analyzeSingleItem(
      image: ImageInput,
      opts: CallOptions,
    ): Promise<AiResult<SingleItemAnalysis>> {
      return runJson({
        operation: 'vision.analyzeSingleItem',
        spec: buildSingleItemPrompt(image),
        schema: singleItemAnalysisSchema,
        targets: visionChain(),
        userId: opts.userId,
      })
    },
  },

  stylist: {
    /**
     * Redacta la frase de cada look. NO elige looks: eso ya lo hizo el motor.
     * Si falla, quien llama debe mostrar los outfits sin explicación (PLAN.md §35).
     */
    async explainOutfits(
      outfits: OutfitForExplanation[],
      ctx: ExplanationContext,
      opts: CallOptions,
    ): Promise<AiResult<string[]>> {
      const result = await runJson({
        operation: 'stylist.explainOutfits',
        spec: buildExplanationsPrompt(outfits, ctx),
        schema: outfitExplanationsSchema,
        targets: stylistChain(),
        userId: opts.userId,
      })

      // El modelo puede devolver de más o de menos: se ajusta al número de looks.
      const explanations = outfits.map((_, i) => result.data.explanations[i] ?? '')
      return { data: explanations, meta: result.meta }
    },
  },

  image: {
    /** Fase 10. La abstracción existe; la función todavía no se usa en la app. */
    async generateTryOn(
      spec: PromptSpec,
      opts: CallOptions,
    ): Promise<AiResult<GeneratedImage>> {
      const targets = imageChain()
      const target = targets[0]
      if (!target) throw new AiError('PROVIDER_ERROR', 'No hay proveedor de imagen configurado.')

      const startedAt = Date.now()
      const meta: AiCallMeta = {
        provider: target.name,
        model: target.model,
        operation: 'image.generateTryOn',
        imageCount: spec.images?.length ?? 0,
        latencyMs: 0,
        status: 'ok',
      }

      try {
        const image = await target.provider.generate(spec, target.model)
        const done: AiCallMeta = { ...meta, latencyMs: Date.now() - startedAt }
        await recordAiUsage(opts.userId, done)
        return { data: image, meta: done }
      } catch (err) {
        const aiError =
          err instanceof AiError
            ? err
            : new AiError('PROVIDER_ERROR', err instanceof Error ? err.message : String(err), err)
        await recordAiUsage(opts.userId, {
          ...meta,
          latencyMs: Date.now() - startedAt,
          status: 'error',
          errorCode: aiError.code,
        })
        throw aiError
      }
    },
  },
}

export type { OutfitForExplanation, ExplanationContext }
