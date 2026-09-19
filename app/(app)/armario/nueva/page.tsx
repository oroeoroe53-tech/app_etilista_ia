import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { checkEntitlement } from '@/lib/subscriptions/entitlements'
import { NewItemFlow } from '@/components/wardrobe/NewItemFlow'
import { Screen, Notice, Button } from '@/components/ui'

export const metadata = { title: 'Añadir prenda · Estilista' }
export const dynamic = 'force-dynamic'

export default async function NewItemPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const permiso = await checkEntitlement(user.id, 'add_clothing_item')

  return (
    <Screen>
      <div className="pt-6 pb-4">
        <Link href="/armario" className="text-sm text-ink-soft">
          ← Armario
        </Link>
      </div>

      <header className="pb-6">
        <p className="eyebrow mb-2">Añadir</p>
        <h1 className="display text-3xl">Una prenda más</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Lo que no salga en tus fotos puedes añadirlo aquí. La foto es opcional.
        </p>
      </header>

      {!permiso.allowed ? (
        <div className="space-y-4">
          <Notice tone="error">
            Tu armario ha llegado al límite del plan: {permiso.used} de {permiso.limit} prendas.
          </Notice>
          <p className="text-sm leading-relaxed text-ink-soft">
            Puedes borrar prendas que ya no uses para hacer hueco.
          </p>
          <Link href="/armario">
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
