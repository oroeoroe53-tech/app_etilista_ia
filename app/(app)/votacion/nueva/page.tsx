import { BackLink } from '@/components/ui'
import { LookPollForm } from '@/components/polls/LookPollForm'

export const metadata = { title: '¿Cuál me pongo? · Selyqo' }

/**
 * Pedir opinión.
 *
 * Se abre con prisa, siempre, así que no hay explicación previa ni ejemplo: dos
 * filas de opciones y un botón. Lo que había antes —hacer fotos de cada
 * alternativa— sigue existiendo un toque más abajo, porque hay un caso en el
 * que sigue siendo lo correcto.
 */
export default function NewPollPage() {
  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/social">social</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Lo monta tu estilista</p>
        <h1 className="display text-display leading-[1.02]">
          ¿Cuál
          <span className="display-italic"> me pongo?</span>
        </h1>
        <p className="mt-3 text-small leading-[1.5] text-ink-soft">
          Tres looks con tu ropa de verdad, para el tiempo que hace hoy. Tú solo
          eliges para qué es y cuánto tiempo tienes.
        </p>
      </header>

      <LookPollForm />
    </div>
  )
}
