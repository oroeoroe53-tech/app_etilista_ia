import type { ProviderName } from './types'

/**
 * Tabla de precios para ESTIMAR coste. No es facturación: sirve para vigilar
 * la tendencia y detectar a tiempo que algo se está disparando.
 *
 * ⚠️ Los precios de los proveedores cambian. Antes de pasar a `AI_MODE=production`
 * hay que contrastar estos valores con la documentación oficial y anotar la fecha.
 * Todo está en este archivo para que actualizarlo sea una sola edición.
 *
 * Unidad: dólares por millón de tokens.
 */

export interface ModelPrice {
  inputPerMillion: number
  outputPerMillion: number
  /** Coste fijo por imagen, cuando el proveedor la cobra aparte del texto. */
  perImage?: number
}

export const PRICING: Record<ProviderName, Record<string, ModelPrice>> = {
  gemini: {
    // Valores orientativos a la espera de verificación (ver aviso arriba).
    'gemini-flash-lite-latest': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    'gemini-flash-latest': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
    'gemini-image-latest': { inputPerMillion: 0.3, outputPerMillion: 30 },
  },
  openai: {
    'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2.0 },
    'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10 },
  },
  mock: {},
}

/** Precio por defecto cuando el modelo no está en la tabla: no romper, pero tampoco mentir con un 0. */
const UNKNOWN_MODEL_PRICE: ModelPrice = { inputPerMillion: 0, outputPerMillion: 0 }

export function estimateCostUsd(params: {
  provider: ProviderName
  model: string
  inputTokens?: number
  outputTokens?: number
  imageCount?: number
}): number {
  if (params.provider === 'mock') return 0

  const price = PRICING[params.provider]?.[params.model] ?? UNKNOWN_MODEL_PRICE

  const input = ((params.inputTokens ?? 0) / 1_000_000) * price.inputPerMillion
  const output = ((params.outputTokens ?? 0) / 1_000_000) * price.outputPerMillion
  const images = (params.imageCount ?? 0) * (price.perImage ?? 0)

  return Number((input + output + images).toFixed(6))
}

/** `true` si el modelo no está en la tabla: útil para avisar en los logs. */
export function isPriceKnown(provider: ProviderName, model: string): boolean {
  if (provider === 'mock') return true
  return Boolean(PRICING[provider]?.[model])
}
