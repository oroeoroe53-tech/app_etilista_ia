import { redirect } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { AnalysisProgress } from '@/components/onboarding/AnalysisProgress'

export const metadata = { title: 'Analizando · Estilista' }
export const dynamic = 'force-dynamic'

export default async function AnalyzingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { count } = await supabase
    .from('outfit_photos')
    .select('id', { count: 'exact', head: true })

  // Sin fotos no hay nada que esperar.
  if ((count ?? 0) === 0) redirect('/onboarding')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 pt-safe">
      <AnalysisProgress initialTotal={count ?? 0} />
    </main>
  )
}
