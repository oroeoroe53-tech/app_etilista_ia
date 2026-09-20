import { analyzePalette } from './color'
import { layerOf } from '@/lib/wardrobe/taxonomy'
import type { WardrobeItem } from './types'

/**
 * Nombre corto de un look.
 *
 * La portada enseña un titular por encima del look ("Neutros y una chaqueta"),
 * y ese titular tiene que existir **sin IA**: la pantalla de inicio se abre
 * todos los días y no puede costar una llamada a un modelo cada vez.
 *
 * Así que sale de lo que el motor ya calculó: la paleta y las capas. Es menos
 * imaginativo que lo que escribiría un modelo, pero es cierto siempre, no
 * cuesta nada y no puede inventarse una prenda que no está.
 *
 * Regla de tono: describe, no vende. "Neutros y una chaqueta" es lo que hay.
 * "Un look effortless para tu martes" no lo es.
 */

/** Cómo llamar a la capa de abrigo según lo que sea de verdad. */
const OUTER_NAMES: Record<string, string> = {
  jacket: 'una chaqueta',
  blazer: 'una americana',
  coat: 'un abrigo',
  cardigan: 'una rebeca',
  vest: 'un chaleco',
}

/**
 * De la nota de paleta a un titular.
 *
 * Las notas vienen en minúscula y en mitad de frase ("todo en neutros"), que no
 * es como se escribe un titular.
 */
const FROM_NOTE: Record<string, string> = {
  'todo en neutros': 'Neutros',
  'paleta monocroma': 'Monocromo',
  'monocromo en un color fuerte': 'Todo del mismo color',
  'un color sobre base neutra': 'Un color sobre neutros',
  'dos colores que se llevan bien': 'Dos colores que se llevan',
}

export function nameOutfit(items: readonly WardrobeItem[]): string {
  if (items.length === 0) return 'Un look'

  const palette = analyzePalette(items)
  const base = palette.note ? FROM_NOTE[palette.note] : null

  const outer = items.find((item) => layerOf(item.category) === 'outer')
  const outerName = outer ? OUTER_NAMES[outer.category] : null

  /*
   * Todos los nombres tienen que poder ir detrás de "Hoy te veo **en**…", que es
   * como los usa la portada. Por eso ninguno empieza por verbo ni preposición:
   * "Con una chaqueta" daría "en con una chaqueta".
   */
  if (base && outerName) return `${base} y ${outerName}`
  if (base) return base
  if (outerName) return `${outerName.charAt(0).toUpperCase()}${outerName.slice(1)} y poco más`

  // Sin paleta clara ni abrigo, el rasgo que queda es lo arreglado que va.
  const formality = items.reduce((sum, i) => sum + i.formality, 0) / items.length
  if (formality >= 4) return 'Un punto más arreglado'
  if (formality <= 2) return 'Algo cómodo'
  return 'Lo de siempre'
}

/**
 * Une los motivos que calculó el motor en una frase.
 *
 * Los `highlights` son fragmentos pensados para encadenarse ("las piezas van en
 * la misma línea", "aguanta la lluvia"). Aquí solo se les pone puntuación.
 */
export function explainFromHighlights(highlights: readonly string[]): string | null {
  const parts = highlights.filter(Boolean).slice(0, 3)
  if (parts.length === 0) return null

  const joined =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`

  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`
}
