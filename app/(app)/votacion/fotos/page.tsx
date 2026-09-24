import { BackLink } from '@/components/ui'
import { PollComposer } from '@/components/polls/PollComposer'

export const metadata = { title: '¿Cuál me pongo? · Estilista' }

/**
 * Montar una votación.
 *
 * Esta pantalla se abre con prisa, siempre. Por eso no hay explicación previa,
 * ni ejemplo, ni tarjeta de bienvenida: se entra y la primera cosa que se ve es
 * el sitio donde va la primera foto.
 */
export default function NewPollPage() {
  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/votacion/nueva">votación</BackLink>

      <header className="pt-2 pb-6">
        <p className="eyebrow mb-2.5">Con fotos tuyas</p>
        <h1 className="display text-display leading-[1.06]">
          ¿Cuál
          <span className="display-italic"> me pongo?</span>
        </h1>
        <p className="mt-3 text-small leading-[1.5] text-ink-soft">
          Para lo que tienes en la mano y el armario no conoce. Haz una foto de
          cada opción; quien la vea vota en dos toques.
        </p>
      </header>

      <PollComposer />
    </div>
  )
}
