import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { getSharedWardrobe } from '@/lib/wardrobe/shared'
import { describeGarment } from '@/lib/wardrobe/labels'
import { BackLink, PhotoSlot } from '@/components/ui'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Su armario · Estilista' }

/**
 * El armario de otra persona.
 *
 * Solo se llega con permiso suyo, y si lo quita, esta pantalla deja de existir
 * al instante: no hay caché ni versión estática. Lo que ya está prestado se ve
 * marcado, porque pedir dos veces la misma prenda es la primera forma de que
 * esto se vuelva incómodo entre amigas.
 */
export default async function SharedWardrobePage({
  params,
}: {
  params: Promise<{ ownerId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { ownerId } = await params
  const wardrobe = await getSharedWardrobe(ownerId, user.id)

  // Sin permiso y «no existe» se responden igual: lo contrario serviría para
  // averiguar quién está registrado.
  if (!wardrobe) notFound()

  return (
    <div
      className="mx-auto w-full max-w-[30rem] pt-safe pb-nav"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <BackLink href="/circulo">círculo</BackLink>

      <header className="pt-2 pb-6">
        <p className="eyebrow mb-2.5">Te deja verlo</p>
        <h1 className="display text-display leading-[1.06]">
          El armario
          <span className="display-italic block">de {wardrobe.ownerName}</span>
        </h1>
        <p className="mono mt-3 text-ink-faint">
          {wardrobe.items.length} {wardrobe.items.length === 1 ? 'prenda' : 'prendas'}
        </p>
      </header>

      {wardrobe.items.length === 0 ? (
        <p className="py-16 text-center text-small text-ink-soft">
          Su armario todavía está vacío.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5">
          {wardrobe.items.map((item) => {
            const label = describeGarment(item)

            return (
              <li key={item.id}>
                <Link
                  href={`/armario/de/${wardrobe.ownerId}/${item.id}`}
                  className="block"
                >
                  <PhotoSlot
                    src={item.imageUrl}
                    label={label}
                    className="aspect-[3/4] rounded-[var(--radius-card)]"
                  />
                  <p className="mt-1.5 truncate text-small">{label}</p>
                  <p className="mono mt-0.5 truncate text-ink-faint">
                    {item.onLoan
                      ? 'prestada ahora'
                      : item.requestedByMe
                        ? 'se la has pedido'
                        : 'disponible'}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-10 border-t border-line pt-6 text-micro leading-[1.6] text-ink-faint">
        Ves su armario porque te ha dado permiso, y lo verás mientras quiera.
        Nada de esto entra en el tuyo ni cambia lo que te propongo a ti.
      </p>
    </div>
  )
}
