/**
 * Lo que una pantalla necesita saber de una votación.
 *
 * Deliberadamente sin fila de base de datos dentro: quien pinta la pantalla no
 * debería poder equivocarse de columna ni enseñar algo que no tocaba. Lo que
 * llega aquí ya está decidido, firmado y contado.
 */

/** Una prenda dentro de un look sometido a votación. */
export interface PollGarment {
  imageUrl: string | null
  label: string
}

export interface PollOptionView {
  id: string
  position: number
  label: string | null

  /**
   * De dónde sale la opción.
   *
   * `photo` es la forma original: te pones las dos cosas y las fotografías.
   * `look` es la que propone el diseño y la que se usa por defecto: lo monta el
   * motor con la ropa del armario, sin fotos y sin vestirse dos veces.
   */
  kind: 'photo' | 'look'

  /** Solo en `look`: el nombre del conjunto, «Oliva y crudo». */
  name: string | null
  /** Solo en `look`: por qué lo montó así. Sale del motor, no de un modelo. */
  why: string | null
  /** Solo en `look`: las prendas, para pintar el collage. */
  garments: PollGarment[]
  /** Solo en `look`: el conjunto guardado, para poder marcarlo como puesto. */
  outfitId: string | null

  /** URL firmada de diez minutos. `null` si la foto ya no está o es un look. */
  imageUrl: string | null
  votes: number
  /** Porcentaje entero sobre el total. 0 cuando nadie ha votado todavía. */
  share: number
  /** Nombres de quien ha votado esto. Vacío mientras la votación esté en curso. */
  voters: string[]
}

export interface PollComment {
  name: string
  optionPosition: number
  text: string
}

export interface PollView {
  id: string
  token: string
  question: string | null

  ownerId: string
  ownerName: string
  /** Quien mira es quien preguntó. Cambia la pantalla entera. */
  isOwner: boolean

  closesAt: string
  /** Ya no se admiten votos. */
  closed: boolean

  options: PollOptionView[]
  totalVotes: number

  /** El voto de quien mira, si ya votó. Permite cambiarlo. */
  myVote: { optionId: string; comment: string | null } | null

  comments: PollComment[]

  /**
   * La opción que va ganando, o `null` si hay empate o nadie ha votado.
   *
   * Un empate se dice, no se rompe. Inventar un ganador cuando hay dos a dos es
   * mentirle a quien tiene que salir por la puerta en cinco minutos.
   */
  leadingOptionId: string | null
}
