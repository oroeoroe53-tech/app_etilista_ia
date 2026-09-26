import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { getSharedWardrobe } from '@/lib/wardrobe/shared'
import { describeGarment } from '@/lib/wardrobe/labels'
import { hasReference } from '@/lib/wardrobe/reference'
import { ReferenceCard } from '@/components/wardrobe/ReferenceCard'
import { RequestForm } from '@/components/loans/RequestForm'
import { BackLink, Notice, PhotoSlot } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Una prenda de otra persona, y el botón de pedirla.
 *
 * Se vuelve a cargar el armario entero en vez de consultar la prenda suelta: es
 * una consulta más, pero la comprobación del permiso vive en un único sitio
 * (`getSharedWardrobe`) y no hay una segunda puerta que alguien pueda olvidarse
 * de cerrar el día que cambie la regla.
 */
export default async function SharedItemPage({
  params,
}: {
  params: Promise<{ ownerId: string; itemId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { ownerId, itemId } = await params
  const wardrobe = await getSharedWardrobe(ownerId, user.id)
  if (!wardrobe) notFound()

  const item = wardrobe.items.find((i) => i.id === itemId)
  if (!item) notFound()

  const label = describeGarment(item)

  return (
    <div className="mx-auto w-full max-w-[30rem] pb-nav">
      <div style={{ paddingInline: 'var(--screen-gutter)' }}>
        <BackLink href={`/armario/de/${ownerId}`}>su armario</BackLink>
      </div>

      <PhotoSlot src={item.imageUrl} label={label} className="mt-2 h-[360px] w-full" />

      <div className="pt-6" style={{ paddingInline: 'var(--screen-gutter)' }}>
        <p className="eyebrow mb-2.5">De {wardrobe.ownerName}</p>
        <h1 className="display text-display-s leading-[1.1]">{label}</h1>

        {/* La referencia, sin boton de corregir: la prenda no es tuya.
            Es el atajo a la pregunta que se hace de verdad al ver la ropa de
            otra persona, antes incluso que la de pedirsela prestada. */}
        {hasReference(item.reference) ? (
          <ReferenceCard reference={item.reference} garmentName={label} />
        ) : null}

        <div className="mt-7">
          {item.onLoan ? (
            <Notice>
              Ahora mismo la tiene prestada otra persona. Vuelve a mirar en unos
              días.
            </Notice>
          ) : item.requestedByMe ? (
            <Notice>
              Ya se la has pedido. {wardrobe.ownerName} te contestará desde la
              aplicación.
            </Notice>
          ) : (
            <>
              <p className="mb-3 text-small leading-[1.5] text-ink-soft">
                Dile para qué la quieres. Es lo que hace que te conteste.
              </p>
              <RequestForm
                itemId={item.id}
                ownerId={wardrobe.ownerId}
                ownerName={wardrobe.ownerName}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
