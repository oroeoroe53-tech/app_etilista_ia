import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listCircle, type CircleMember } from '@/lib/circle/queries'
import { setGrant, removeFriend } from './actions'
import { InviteButton } from '@/components/circle/InviteButton'
import { BackLink, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

export const metadata = { title: 'Tu círculo · Estilista' }

/*
 * Nunca estática: lo que se ve aquí son permisos, y un permiso servido desde
 * una caché es un permiso que alguien cree haber quitado y sigue puesto.
 */
export const dynamic = 'force-dynamic'

/**
 * Tu círculo.
 *
 * Dos ideas, y la segunda es la importante:
 *
 *  · Quién está dentro. Se entra solo por una invitación tuya.
 *  · **Qué le dejas ver a cada quien.** Estar en tu círculo no abre tu armario:
 *    eso se concede persona a persona, aquí, y se quita igual de rápido.
 *
 * No está en la barra de navegación. Se llega desde Perfil, porque esto se
 * configura de vez en cuando y no se visita a diario.
 */
export default async function CirclePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const circle = await listCircle(user.id)

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/perfil">perfil</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">Las tuyas</p>
        <h1 className="display text-[31px] leading-[1.06]">
          Tu círculo
          <span className="display-italic block">y lo que ve cada una</span>
        </h1>
      </header>

      {circle.length === 0 ? (
        <EmptyState
          title="Todavía no hay nadie"
          body="Invita a quien le preguntarías por WhatsApp antes de salir. Con una persona esto ya sirve."
          action={<InviteButton />}
        />
      ) : (
        <>
          <ul>
            {circle.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </ul>

          <div className="mt-9">
            <InviteButton />
          </div>
        </>
      )}

      <p className="mt-10 border-t border-line pt-6 text-[10.5px] leading-[1.6] text-ink-faint">
        Estar en tu círculo no deja ver tu ropa. Eso se da aquí, persona a
        persona, y se quita cuando quieras: quien lo pierde deja de ver tu
        armario al instante y no recibe ningún aviso.
      </p>
    </div>
  )
}

/**
 * Una persona, y el dial de lo que ve.
 *
 * Tres estados en una sola línea en vez de dos interruptores sueltos: con dos
 * existiría «puede montarme looks pero no ver mi ropa», que no significa nada.
 * Cada botón es un envío del formulario, así que esto funciona sin JavaScript y
 * sin un solo componente de cliente.
 */
function MemberRow({ member }: { member: CircleMember }) {
  const levels = [
    { value: 'none', label: 'Nada' },
    { value: 'view', label: 'Ve mi ropa' },
    { value: 'style', label: 'Y me viste' },
  ] as const

  const current = member.iGive ?? 'none'

  return (
    <li className="border-t border-line py-4 last:border-b">
      <div className="flex items-baseline justify-between gap-4">
        <p className="display truncate text-[19px]">{member.name}</p>

        <form action={removeFriend}>
          <input type="hidden" name="friendId" value={member.id} />
          <button type="submit" className="shrink-0 py-1 text-[10.5px] text-ink-faint">
            quitar
          </button>
        </form>
      </div>

      <form action={setGrant} className="mt-2.5 flex gap-1.5">
        <input type="hidden" name="friendId" value={member.id} />
        {levels.map((level) => (
          <button
            key={level.value}
            type="submit"
            name="level"
            value={level.value}
            aria-pressed={current === level.value}
            className={cn(
              'rounded-full border px-3 py-[7px] text-[11px] transition-colors',
              current === level.value
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-[color-mix(in_srgb,var(--ink)_16%,transparent)] text-ink-soft',
            )}
          >
            {level.label}
          </button>
        ))}
      </form>

      {/*
        Lo que ella te deja ver a ti. Informativo y en voz baja: no se puede
        cambiar desde aquí, porque no es tuyo. Sin esta línea, la pantalla
        parecería decir que la relación es simétrica, y no lo es.
      */}
      <p className="mono mt-2 text-ink-faint">
        {member.theyGive === 'style'
          ? 'te deja ver su ropa y vestirla'
          : member.theyGive === 'view'
            ? 'te deja ver su ropa'
            : 'no te deja ver la suya'}
      </p>
    </li>
  )
}
