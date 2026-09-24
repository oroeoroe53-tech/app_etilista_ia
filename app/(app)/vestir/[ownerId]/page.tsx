import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { getSharedWardrobe } from '@/lib/wardrobe/shared'
import { StyleComposer } from '@/components/styled/StyleComposer'
import { BackLink } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Vestirla · Estilista' }

/**
 * Montarle un look a alguien.
 *
 * Exige el nivel `style` del permiso, no basta con ver el armario. La
 * comprobación se hace contra lo que devuelve `getSharedWardrobe`, que es el
 * único sitio donde se lee ese permiso: si algún día cambia la regla, cambia
 * ahí y aquí no hay una segunda puerta que alguien se olvide de cerrar.
 */
export default async function StylePage({
  params,
}: {
  params: Promise<{ ownerId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { ownerId } = await params
  const wardrobe = await getSharedWardrobe(ownerId, user.id)

  // Sin permiso, sin el nivel suficiente, o sin ropa: lo mismo que no existir.
  if (!wardrobe || wardrobe.level !== 'style') notFound()

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/circulo">círculo</BackLink>

      <header className="pt-2 pb-6">
        <p className="eyebrow mb-2.5">Te deja vestirla</p>
        <h1 className="display text-display leading-[1.06]">
          Móntale algo
          <span className="display-italic block">a {wardrobe.ownerName}</span>
        </h1>
        <p className="mt-3 text-small leading-[1.5] text-ink-soft">
          Con su ropa de verdad. Toca las prendas en el orden en que se las
          pondría.
        </p>
      </header>

      {wardrobe.items.length === 0 ? (
        <p className="py-16 text-center text-small text-ink-soft">
          Su armario todavía está vacío.
        </p>
      ) : (
        <StyleComposer
          ownerId={wardrobe.ownerId}
          ownerName={wardrobe.ownerName}
          items={wardrobe.items}
        />
      )}
    </div>
  )
}
