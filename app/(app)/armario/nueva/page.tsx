import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { checkEntitlement } from '@/lib/subscriptions/entitlements'
import { NewItemFlow } from '@/components/wardrobe/NewItemFlow'
import { Screen, Notice, Button, BackLink } from '@/components/ui'

export const metadata = { title: 'Añadir prenda · Estilista' }
export const dynamic = 'force-dynamic'

export default async function NewItemPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const permiso = await checkEntitlement(user.id, 'add_clothing_item')

  return (
    <Screen>
      <BackLink href="/armario">atrás</BackLink>

      <header className="pt-4 pb-6">
        <p className="eyebrow mb-2.5">Nueva prenda</p>
        <h1 className="display text-display">
          Súbela y yo
          <span className="display-italic block">la describo</span>
        </h1>
        <p className="mt-3 text-small leading-[1.5] text-ink-soft">
          Lo que no salga en tus fotos puedes añadirlo aquí. La foto es opcional.
        </p>
      </header>

      {!permiso.allowed ? (
        <div className="space-y-4">
          <Notice tone="error">
            Tu armario ha llegado al límite del plan: {permiso.used} de {permiso.limit} prendas.
          </Notice>
          <p className="text-small leading-[1.5] text-ink-soft">
            Puedes borrar prendas que ya no uses para hacer hueco.
          </p>
          <Link href="/armario" className="block">
            <Button variant="secondary" fullWidth>
              Volver al armario
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {permiso.remaining <= 5 ? (
            <div className="mb-6">
              <Notice>
                Te quedan {permiso.remaining} prendas de las {permiso.limit} de tu plan.
              </Notice>
            </div>
          ) : null}
          <NewItemFlow />
        </>
      )}
    </Screen>
  )
}
