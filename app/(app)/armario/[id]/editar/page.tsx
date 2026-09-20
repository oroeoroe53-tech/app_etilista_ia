import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { describeGarment } from '@/lib/wardrobe/labels'
import { updateItem, type ItemFormState } from '@/app/(app)/armario/actions'
import { ItemForm, type ItemFormValues } from '@/components/wardrobe/ItemForm'
import { Screen } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data } = await supabase
    .from('clothing_items')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  const item = data as (ItemFormValues & { id: string; category: string }) | null
  if (!item) notFound()

  // La acción se ata al id aquí, en el servidor: si viajara en el formulario,
  // bastaría con cambiarlo en el navegador para intentar editar otra prenda.
  async function action(prev: ItemFormState, formData: FormData) {
    'use server'
    return updateItem(id, prev, formData)
  }

  return (
    <Screen>
      <div className="pt-6 pb-4">
        <Link href={`/armario/${id}`} className="text-sm text-ink-soft">
          ← {describeGarment(item)}
        </Link>
      </div>

      <header className="pb-6">
        <p className="eyebrow mb-2">Corregir</p>
        <h1 className="display text-[30px]">Cómo es de verdad</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Lo que apunté puede no ser exacto. Cámbialo y aprenderé de ello.
        </p>
      </header>

      <ItemForm action={action} values={item} submitLabel="Guardar cambios" />
    </Screen>
  )
}
