import { z } from 'zod'

/**
 * El estilista NO elige outfits. El motor determinista ya ha decidido cuáles son
 * los tres looks (PLAN.md §6). Aquí el modelo solo redacta la frase que acompaña
 * a cada uno, en el mismo orden en que se le pasaron.
 */
export const outfitExplanationsSchema = z.object({
  explanations: z.array(z.string().min(1).max(220)),
})
export type OutfitExplanations = z.infer<typeof outfitExplanationsSchema>

export const STYLIST_OUTPUT_SHAPE = `{
  "explanations": ["frase para el look 1", "frase para el look 2", "frase para el look 3"]
}`
