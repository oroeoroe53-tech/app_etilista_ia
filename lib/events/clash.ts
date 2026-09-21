import { colorLabel } from '@/lib/wardrobe/labels'

/**
 * ¿Vamos iguales?
 *
 * Es la única pieza de esta función que hace algo que un grupo de mensajería no
 * hace ya. Poner cuatro fotos en una rejilla es lo que hace WhatsApp; decir
 * «Marta y tú vais de verde» es lo que hace falta.
 *
 * Reglas, y todas son deliberadas:
 *
 *  · **Solo avisa de coincidencias**, nunca opina sobre si algo pega. Esto no
 *    es el motor: aquí no hay prendas analizadas, solo un color que cada quien
 *    ha elegido a mano.
 *  · **`multicolor` no cuenta.** Dos estampados distintos no son el mismo
 *    vestido, y avisar de eso sería ruido en la mitad de los eventos.
 *  · **El negro tampoco.** En una boda o una cena van de negro la mitad de las
 *    invitadas, y siempre ha estado bien: un aviso ahí no informa de nada y
 *    quema el aviso para cuando importa.
 *  · Quien no ha dicho de qué va, no aparece. No se adivina.
 */

export interface GuestColor {
  name: string
  color: string | null
}

export interface Clash {
  color: string
  names: string[]
}

/** Colores que se repiten sin que eso signifique nada. */
const IGNORED = new Set(['black', 'multicolor'])

export function findClashes(guests: readonly GuestColor[]): Clash[] {
  const byColor = new Map<string, string[]>()

  for (const guest of guests) {
    if (!guest.color || IGNORED.has(guest.color)) continue
    const names = byColor.get(guest.color) ?? []
    names.push(guest.name)
    byColor.set(guest.color, names)
  }

  const clashes: Clash[] = []
  for (const [color, names] of byColor) {
    if (names.length >= 2) clashes.push({ color, names })
  }

  // Primero donde más gente coincide: es lo que más urge resolver.
  return clashes.sort((a, b) => b.names.length - a.names.length)
}

/**
 * El aviso, escrito como lo diría una persona.
 *
 * Se le pasa el nombre de quien mira para poder decir «y tú», que es lo que
 * hace que el aviso vaya con una: «Marta y tú vais de verde» se lee distinto
 * que «Marta y Ana van de verde», aunque una sea Ana.
 */
export function clashMessage(clash: Clash, viewerName?: string | null): string {
  const color = colorLabel(clash.color).toLowerCase()

  const others = viewerName ? clash.names.filter((n) => n !== viewerName) : [...clash.names]
  const includesViewer = viewerName ? clash.names.includes(viewerName) : false

  /*
   * El «tú» entra en la lista como un nombre más, y no pegado al final.
   *
   * Encadenarlo aparte producía «Marta y Lucía y tú»: la enumeración ya pone
   * su propia «y» antes del último. Metiéndolo dentro sale «Marta, Lucía y tú»,
   * que es como se dice.
   */
  const subject = includesViewer ? joinNames([...others, 'tú']) : joinNames(clash.names)

  const verb = includesViewer || clash.names.length > 1 ? 'vais' : 'va'
  return `${subject} ${verb} de ${color}`
}

function joinNames(names: readonly string[]): string {
  const [first, ...rest] = names
  if (!first) return ''
  if (rest.length === 0) return first
  return `${names.slice(0, -1).join(', ')} y ${rest[rest.length - 1]}`
}

/**
 * Qué te queda libre.
 *
 * El diseño dice aquí «la IA te ha cambiado a teja», y eso sería mentira: los
 * looks de un evento los declara cada una a mano, no los monta el motor, así
 * que no hay nada que cambiar. Lo que sí se puede hacer —y es la mitad útil de
 * esa frase— es decir qué colores **que tú tienes** no ha cogido nadie.
 *
 * De ahí las dos listas: lo que hay en tu armario y lo que ya está pillado. Sin
 * la primera, la sugerencia sería «ve de amarillo» a quien no tiene nada
 * amarillo, que es peor que no decir nada.
 */
export function freeColors(
  guests: readonly GuestColor[],
  myColors: readonly string[],
  limit = 3,
): string[] {
  const taken = new Set(guests.map((g) => g.color).filter((c): c is string => Boolean(c)))

  return [...new Set(myColors)]
    .filter((color) => !taken.has(color) && !IGNORED.has(color))
    .slice(0, limit)
}
