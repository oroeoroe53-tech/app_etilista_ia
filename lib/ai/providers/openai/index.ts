import { serverEnv } from '@/lib/env'
import {
  AiError,
  type GeneratedImage,
  type ImageGenerationProvider,
  type PromptSpec,
  type RawCompletion,
  type StylistProvider,
  type VisionProvider,
} from '@/lib/ai/types'

/**
 * Proveedor OpenAI vía Chat Completions.
 *
 * Su papel principal es ser la red de seguridad: si Gemini falla o degrada, el
 * router reintenta aquí sin que la aplicación se entere (PLAN.md §5).
 *
 * Nota sobre parámetros: la familia GPT-5 usa `max_completion_tokens` y no
 * admite `temperature` personalizada. Se envía lo mínimo compatible en lugar de
 * ramificar por nombre de modelo, que sería frágil.
 */

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string; code?: string }
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

function apiKey(): string {
  const key = serverEnv().OPENAI_API_KEY
  if (!key) {
    throw new AiError(
      'NO_API_KEY',
      'Falta OPENAI_API_KEY. Con AI_MODE=production hay que definirla en .env.local.',
    )
  }
  return key
}

function buildContent(spec: PromptSpec): ContentPart[] {
  const content: ContentPart[] = [{ type: 'text', text: spec.user }]
  for (const image of spec.images ?? []) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    })
  }
  return content
}

async function completeJson(spec: PromptSpec, model: string): Promise<RawCompletion> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: spec.system },
        { role: 'user', content: buildContent(spec) },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: spec.maxOutputTokens ?? 2048,
    }),
  })

  const json = (await response.json()) as OpenAiResponse

  if (!response.ok || json.error) {
    throw new AiError(
      'PROVIDER_ERROR',
      `OpenAI ${response.status}: ${json.error?.message ?? response.statusText}`,
    )
  }

  const text = json.choices?.[0]?.message?.content ?? ''
  if (!text.trim()) {
    throw new AiError('EMPTY_RESPONSE', 'OpenAI devolvió una respuesta vacía.')
  }

  return {
    text,
    inputTokens: json.usage?.prompt_tokens,
    outputTokens: json.usage?.completion_tokens,
  }
}

export const openaiVisionProvider: VisionProvider = {
  name: 'openai',
  complete: completeJson,
}

export const openaiStylistProvider: StylistProvider = {
  name: 'openai',
  complete: completeJson,
}

/**
 * Generación de imágenes: Fase 10. La abstracción existe para que el día que se
 * implemente no haya que tocar nada más, pero no hay implementación todavía.
 */
export const openaiImageProvider: ImageGenerationProvider = {
  name: 'openai',
  async generate(): Promise<GeneratedImage> {
    throw new AiError(
      'NOT_IMPLEMENTED',
      'La generación de imágenes con OpenAI llegará en la Fase 10.',
    )
  },
}
