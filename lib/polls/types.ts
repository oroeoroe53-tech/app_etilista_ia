/**
 * Lo que una pantalla necesita saber de una votación.
 *
 * Deliberadamente sin fila de base de datos dentro: quien pinta la pantalla no
 * debería poder equivocarse de columna ni enseñar algo que no tocaba. Lo que
 * llega aquí ya está decidido, firmado y contado.
 */

export interface PollOptionView {
  id: string
  position: number
  label: string | null
  /** URL firmada de diez minutos. `null` si la foto ya no está. */
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
