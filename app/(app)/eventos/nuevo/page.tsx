import { BackLink } from '@/components/ui'
import { EventForm } from '@/components/events/EventForm'

export const metadata = { title: 'Nuevo evento · Estilista' }

export default function NewEventPage() {
  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/eventos">eventos</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Que no vayáis iguales</p>
        <h1 className="display text-[31px] leading-[1.06]">
          Un evento
          <span className="display-italic block">con las que van</span>
        </h1>
      </header>

      <EventForm />
    </div>
  )
}
