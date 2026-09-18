import { STYLIST_OUTPUT_SHAPE } from '@/lib/ai/schemas/stylist'
import type { PromptSpec } from '@/lib/ai/types'

export interface OutfitForExplanation {
  items: string[]
  /** Señales que YA calculó el motor determinista. El modelo no decide, solo redacta. */
  highlights: string[]
}

export interface ExplanationContext {
  occasion?: string
  temperatureC?: number
  rain?: boolean
}

const SYSTEM = `Eres un estilista personal que escribe en español de España.
Escribes frases breves, concretas y sin adular. Nunca mencionas inteligencia
artificial, algoritmos ni puntuaciones. Respondes siempre con un único objeto
JSON válido, sin markdown y sin texto alrededor.`

/**
 * El motor ya eligió los looks. Aquí el modelo solo pone la frase.
 *
 * No se le mandan fotos ni el armario entero: solo los nombres de las prendas y
 * los motivos que el motor ya calculó. Eso mantiene el prompt diminuto y barato,
 * y evita que el modelo se invente razones que el sistema no ha usado.
 */
export function buildExplanationsPrompt(
  outfits: OutfitForExplanation[],
  ctx: ExplanationContext,
): PromptSpec {
  const contexto = [
    ctx.occasion ? `Ocasión: ${ctx.occasion}` : null,
    typeof ctx.temperatureC === 'number' ? `Temperatura: ${ctx.temperatureC}°C` : null,
    ctx.rain ? 'Está lloviendo' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const lista = outfits
    .map(
      (o, i) =>
        `Look ${i + 1}: ${o.items.join(', ')}\n  Motivos: ${o.highlights.join('; ') || 'ninguno destacable'}`,
    )
    .join('\n')

  const user = `${contexto ? `${contexto}\n\n` : ''}${lista}

Escribe UNA frase para cada look, en el mismo orden, máximo 25 palabras cada una.
Apóyate solo en los motivos indicados; no añadas razones nuevas.
Habla de la ropa, no del sistema.

Responde únicamente con este JSON:
${STYLIST_OUTPUT_SHAPE}`

  return {
    system: SYSTEM,
    user,
    temperature: 0.7,
    maxOutputTokens: 400,
  }
}
