import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { listCircle, type CircleMember } from '@/lib/circle/queries'
import { InviteButton } from '@/components/circle/InviteButton'
import { BackLink, EmptyState, QuietRow } from '@/components/ui'
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
      <BackLink href="/social">social</BackLink>

      <header className="pt-2 pb-7">
        <p className="eyebrow mb-2.5">
          Círculo{circle.length > 0 ? ` · ${circle.length} ${circle.length === 1 ? 'persona' : 'personas'}` : ''}
        </p>
        <h1 className="display text-display leading-[1.06]">
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
          <QuietRow href="/prestamos" title="Quién tiene qué">
            Lo que os habéis prestado
          </QuietRow>

          <ul className="mt-2">
            {circle.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </ul>

          <div className="mt-9">
            <InviteButton />
          </div>
        </>
      )}

      <p className="mt-10 border-t border-line pt-6 text-micro leading-[1.6] text-ink-faint">
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
  return (
    <li>
      <Link
        href={`/circulo/${member.id}`}
        className="flex items-center gap-3.5 border-t border-line py-3.5 last:border-b"
      >
        {/*
          La inicial en un círculo.

          No hay fotos de perfil en esta aplicación y no las va a haber: es un
          armario, no una red social. La inicial identifica de sobra en una
          lista de cinco y no obliga a nadie a elegir una foto suya para poder
          prestarle una chaqueta a su hermana.
        */}
        <span
          aria-hidden
          className="display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-lead"
        >
          {member.name.trim().charAt(0).toUpperCase()}
        </span>

        <span className="min-w-0 flex-1">
          <span className="display block truncate text-lead">{member.name}</span>
          <span className="mono mt-0.5 block truncate text-ink-faint">
            {member.theyGive === 'style'
              ? 'te deja ver su ropa y vestirla'
              : member.theyGive === 'view'
                ? 'te deja ver su ropa'
                : 'armario privado'}
          </span>
        </span>

        {/*
          Lo que TÚ le dejas ver, en una etiqueta. El dial se ha mudado a su
          ficha: cinco diales seguidos en una lista invitan a tocarlos sin
          mirar, y esto no es una fila de interruptores, son permisos.
        */}
        <span
          className={cn(
            'mono shrink-0 rounded-full px-2.5 py-1 text-micro',
            member.iGive
              ? 'bg-accent text-accent-ink'
              : 'border border-line text-ink-faint',
          )}
        >
          {member.iGive === 'style' ? 'te viste' : member.iGive === 'view' ? 've tu ropa' : 'nada'}
        </span>
      </Link>
    </li>
  )
}
