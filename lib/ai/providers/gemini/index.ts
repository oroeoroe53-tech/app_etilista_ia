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
 * Proveedor Gemini vía API REST.
 *
 * Se usa `fetch` directamente en lugar del SDK oficial: la superficie que
 * necesitamos son dos endpoints, y así el bundle del servidor no crece ni
 * heredamos las roturas de una dependencia más.
 *
 * El provider no valida ni repara nada: devuelve texto. De eso se encarga el router.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
    finishReason?: string
  }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  error?: { message?: string; status?: string }
}

function apiKey(): string {
  const key = serverEnv().GEMINI_API_KEY
  if (!key) {
    throw new AiError(
      'NO_API_KEY',
      'Falta GEMINI_API_KEY. Con AI_MODE=production hay que definirla en .env.local.',
    )
  }
  return key
}

function buildParts(spec: PromptSpec): GeminiPart[] {
  const parts: GeminiPart[] = [{ text: spec.user }]
  for (const image of spec.images ?? []) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } })
  }
  return parts
}

async function callGemini(
  spec: PromptSpec,
  model: string,
  extraConfig: Record<string, unknown>,
): Promise<GeminiResponse> {
  const response = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey(),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: spec.system }] },
      contents: [{ role: 'user', parts: buildParts(spec) }],
      generationConfig: {
        temperature: spec.temperature ?? 0.2,
        maxOutputTokens: spec.maxOutputTokens ?? 2048,
        ...extraConfig,
      },
    }),
  })

  const json = (await response.json()) as GeminiResponse

  if (!response.ok || json.error) {
    throw new AiError(
      'PROVIDER_ERROR',
      `Gemini ${response.status}: ${json.error?.message ?? response.statusText}`,
    )
  }
  return json
}

/** Texto en JSON. `responseMimeType` obliga a Gemini a devolver JSON sintáctico. */
async function completeJson(spec: PromptSpec, model: string): Promise<RawCompletion> {
  const json = await callGemini(spec, model, { responseMimeType: 'application/json' })

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text.trim()) {
    throw new AiError('EMPTY_RESPONSE', 'Gemini devolvió una respuesta vacía.')
  }

  return {
    text,
    inputTokens: json.usageMetadata?.promptTokenCount,
    outputTokens: json.usageMetadata?.candidatesTokenCount,
  }
}

export const geminiVisionProvider: VisionProvider = {
  name: 'gemini',
  complete: completeJson,
}

export const geminiStylistProvider: StylistProvider = {
  name: 'gemini',
  complete: completeJson,
}

export const geminiImageProvider: ImageGenerationProvider = {
  name: 'gemini',
  async generate(spec: PromptSpec, model: string): Promise<GeneratedImage> {
    const json = await callGemini(spec, model, { responseModalities: ['IMAGE'] })

    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
    if (!part?.inlineData) {
      throw new AiError('EMPTY_RESPONSE', 'Gemini no devolvió ninguna imagen.')
    }

    return { data: part.inlineData.data, mimeType: part.inlineData.mimeType }
  },
}
