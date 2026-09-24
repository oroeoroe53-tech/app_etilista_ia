/**
 * Reparto de anchos del mosaico.
 *
 * El mosaico de Social no tiene piezas fijas: «Te han vestido» solo existe si
 * alguien te ha vestido, y «Préstamos» pesa distinto si hay uno sin contestar.
 * Eso rompe cualquier maqueta escrita a mano, porque en cuanto desaparece una
 * media queda un hueco de media pantalla y el mosaico se lee como un error.
 *
 * Aquí cada pieza declara lo que PIDE, no lo que ocupa. El reparto se calcula
 * después, y la última de cada fila se estira hasta llenarla. Así no hay ningún
 * estado en el que quede un agujero, y nadie tiene que acordarse de recolocar
 * nada al añadir una pieza nueva.
 *
 * Seis columnas porque es el mínimo que divide bien entre dos y entre tres: una
 * pieza grande son 6, una media 3 y una pequeña 2.
 */

export type TileWeight = 'hero' | 'half' | 'small'

const SPAN: Record<TileWeight, number> = { hero: 6, half: 3, small: 2 }

const COLUMNS = 6

export interface Packed<T> {
  item: T
  /** Columnas que ocupa, de 1 a 6. */
  span: number
}

/**
 * Reparte las piezas en filas de seis columnas.
 *
 * La última de cada fila incompleta se estira. Es deliberado que crezca la
 * última y no la primera: al leer de arriba abajo, una pieza ancha al final de
 * la fila cierra el bloque; al principio, parece que sobra sitio a la derecha.
 */
export function packTiles<T>(tiles: readonly (readonly [T, TileWeight])[]): Packed<T>[] {
  const out: Packed<T>[] = []
  let row: Packed<T>[] = []
  let used = 0

  const closeRow = () => {
    if (row.length === 0) return
    const last = row[row.length - 1]
    if (last && used < COLUMNS) {
      // Todo el sobrante a la última: repartirlo dejaría anchos que no casan
      // con ninguna otra fila y el mosaico perdería su rejilla.
      last.span += COLUMNS - used
    }
    out.push(...row)
    row = []
    used = 0
  }

  for (const [item, weight] of tiles) {
    const span = SPAN[weight]
    if (used + span > COLUMNS) closeRow()
    row.push({ item, span })
    used += span
  }
  closeRow()

  return out
}
