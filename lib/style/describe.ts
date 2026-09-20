import { confidence, topValues, rejectedValues, type StyleProfile } from './profile'
import { STYLE_LABELS, FIT_LABELS, colorLabel } from '@/lib/wardrobe/labels'
import type { Style, Fit } from '@/lib/wardrobe/taxonomy'

/**
 * El perfil, contado en castellano.
 *
 * Los pesos internos no se enseñan (PLAN.md §16 y §42). La persona no quiere
 * saber que su afinidad con el minimalismo es 0,82: quiere reconocerse en lo que
 * lee. Y si lee un número, lo que piensa es "esto es un programa midiéndome", que
 * es justo lo contrario de lo que el producto pretende.
 *
 * Aquí no se inventa nada: cada frase sale de valores que superan el umbral.
 */

export interface StylePortrait {
  headline: string
  /**
   * Segunda palabra del titular, la que va en cursiva.
   *
   * "Casual" a secas describe a media humanidad; "Casual *minimalista*" ya es
   * alguien. Solo existe cuando hay dos estilos con peso suficiente: inventarla
   * para que el titular quede bonito sería decir algo que no se ha medido.
   */
  headlineSecond: string | null
  lines: string[]
  /** Colores dominantes, para enseñarlos como muestras. */
  colors: string[]
  /** Frase honesta sobre lo poco o mucho que sabemos todavía. */
  caveat: string | null
}

/** Une una lista en lenguaje natural: "negro, beis y gris". */
function list(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

export function describeProfile(profile: StyleProfile): StylePortrait {
  const level = confidence(profile)

  if (level === 'unknown') {
    return {
      headline: 'Todavía te estoy',
      headlineSecond: 'conociendo',
      lines: [
        'Con unas cuantas fotos más y algún look valorado empezaré a entender cómo vistes.',
      ],
      colors: [],
      caveat: null,
    }
  }

  const styles = topValues(profile, 'style', 3)
  const colors = topValues(profile, 'color', 4)
  const fits = topValues(profile, 'fit', 2)
  const rejectedColors = rejectedValues(profile, 'color').slice(0, 3)

  const lines: string[] = []

  if (colors.length > 0) {
    lines.push(`Vistes sobre todo de ${list(colors.map((c) => lower(colorLabel(c.value))))}.`)
  }

  if (styles.length > 0) {
    const names = styles.map((s) => lower(STYLE_LABELS[s.value as Style] ?? s.value))
    lines.push(
      styles.length === 1
        ? `Tu estilo tira a ${names[0]}.`
        : `Tu estilo se mueve entre lo ${names[0]} y lo ${names[1]}.`,
    )
  }

  if (fits.length > 0) {
    const forms = fits
      .map((f) => FIT_LABELS[f.value as Fit]?.mp)
      .filter((word): word is string => Boolean(word))
    if (forms.length > 0) lines.push(`Te decantas por cortes ${list(forms)}.`)
  }

  const bias = profile.formalityBias
  if (bias <= -0.25) {
    lines.push('Vas cómoda antes que arreglada.')
  } else if (bias >= 0.25) {
    lines.push('Te gusta ir arreglada, incluso entre semana.')
  } else if (lines.length > 0) {
    lines.push('Te mueves bien entre lo informal y lo arreglado.')
  }

  if (rejectedColors.length > 0) {
    lines.push(
      `Lo que esquivas: ${list(rejectedColors.map((c) => lower(colorLabel(c.value))))}.`,
    )
  }

  const headline =
    styles.length > 0
      ? (STYLE_LABELS[styles[0]!.value as Style] ?? 'Tu estilo')
      : colors.length > 0
        ? `Sobre todo, ${lower(colorLabel(colors[0]!.value))}`
        : 'Tu estilo'

  const headlineSecond =
    styles.length > 1
      ? lower(STYLE_LABELS[styles[1]!.value as Style] ?? styles[1]!.value)
      : null

  return {
    headline,
    headlineSecond,
    lines: lines.length > 0 ? lines : ['Aún no veo un patrón claro en lo que llevas.'],
    colors: colors.map((c) => c.value),
    caveat:
      level === 'learning'
        ? 'Es una primera impresión. Cuanto más uses la aplicación, más afinaré.'
        : null,
  }
}

/**
 * Código hexadecimal para pintar la muestra de color. Solo presentación.
 *
 * Los cinco primeros son los del diseño: no son los colores "reales" sino los
 * que quedan bien juntos sobre crema, que es como se ven siempre —en fila, en
 * la pantalla de Estilo— y nunca aislados.
 */
export const COLOR_SWATCHES: Record<string, string> = {
  black: '#1b1a17',
  white: '#f7f4ee',
  grey: '#9a9a9f',
  navy: '#2b3a4d',
  blue: '#3b6ea8',
  light_blue: '#93b8d8',
  beige: '#cbbfa8',
  brown: '#7a5a42',
  cream: '#efe6d4',
  green: '#4a7a55',
  olive: '#5a6352',
  red: '#a8352c',
  burgundy: '#6d2733',
  pink: '#dba7b4',
  purple: '#6b4b84',
  yellow: '#d8b84a',
  orange: '#c9683a',
  gold: '#b08d4a',
  silver: '#bfc3c7',
  multicolor: '#8a8a8a',
}
