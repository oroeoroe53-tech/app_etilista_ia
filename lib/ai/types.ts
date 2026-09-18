/**
 * Contratos del AI Router.
 *
 * Los providers son deliberadamente tontos: reciben un prompt ya construido,
 * llaman a su API y devuelven texto crudo más el consumo de tokens.
 *
 * Todo lo transversal —validar, reparar JSON, reintentar, hacer fallback,
 * registrar coste— vive en el router y se escribe UNA sola vez.
 * Así añadir un proveedor nuevo es escribir ~60 líneas, no reimplementar la lógica.
 */

export type ProviderName = 'gemini' | 'openai' | 'mock'

export type AiOperation =
  | 'vision.analyzeOutfitBatch'
  | 'vision.analyzeSingleItem'
  | 'stylist.explainOutfits'
  | 'image.generateTryOn'

export interface ImageInput {
  /** Base64 sin el prefijo `data:`. */
  data: string
  mimeType: string
  /** Posición en el lote. El modelo se refiere a las fotos por este índice. */
  index: number
}

export interface PromptSpec {
  system: string
  user: string
  images?: ImageInput[]
  /** Pista de longitud de salida. Los providers la traducen a su parámetro. */
  maxOutputTokens?: number
  temperature?: number
}

export interface RawCompletion {
  text: string
  inputTokens?: number
  outputTokens?: number
}

export interface GeneratedImage {
  /** Base64 sin prefijo. */
  data: string
  mimeType: string
}

export interface VisionProvider {
  readonly name: ProviderName
  complete(spec: PromptSpec, model: string): Promise<RawCompletion>
}

export interface StylistProvider {
  readonly name: ProviderName
  complete(spec: PromptSpec, model: string): Promise<RawCompletion>
}

export interface ImageGenerationProvider {
  readonly name: ProviderName
  generate(spec: PromptSpec, model: string): Promise<GeneratedImage>
}

/** Metadatos de una llamada, tal y como acaban en la tabla `ai_usage`. */
export interface AiCallMeta {
  provider: ProviderName
  model: string
  operation: AiOperation
  inputTokens?: number
  outputTokens?: number
  imageCount: number
  estimatedCostUsd?: number
  latencyMs: number
  status: 'ok' | 'error' | 'fallback'
  errorCode?: string
}

export interface AiResult<T> {
  data: T
  meta: AiCallMeta
}

/** Error de IA con código estable, para poder distinguirlo en logs y en la UI. */
export class AiError extends Error {
  constructor(
    public readonly code:
      | 'NO_API_KEY'
      | 'PROVIDER_ERROR'
      | 'INVALID_JSON'
      | 'SCHEMA_MISMATCH'
      | 'EMPTY_RESPONSE'
      | 'NOT_IMPLEMENTED',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AiError'
  }
}
