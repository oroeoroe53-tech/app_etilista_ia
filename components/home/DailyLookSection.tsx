import { createClient } from '@/lib/supabase/server'
import { signMany } from '@/lib/storage/signed'
import { BUCKETS } from '@/lib/storage/paths'
import { dailyLookFor } from '@/lib/outfits/daily-request'
import { TodayLook } from './TodayLook'
import { Shimmer } from '@/components/ui/Skeletons'

/**
 * El look de hoy, fuera del camino crítico.
 *
 * Esta es la parte lenta de la portada y no se puede acelerar del todo: hay que
 * preguntar el tiempo a una API de fuera, cargar el armario entero, componer y,
 * la primera vez de cada día, guardar. Son cuatro esperas encadenadas, y antes
 * la pantalla no enseñaba **nada** hasta que terminaban todas.
 *
 * Sacándolo a su propio componente, la portada se pinta entera —titular,
 * armario, filas— y el look llega detrás. El tiempo total no cambia; lo que
 * cambia es que deja de parecer que la aplicación no responde, que es el
 * problema que se notaba.
 *
 * Por eso el hueco tiene la forma y el tamaño exactos de la tarjeta: para que
 * cuando llegue no salte nada de sitio.
 */
export async function DailyLookSection({
  userId,
  hasWardrobe,
  circleCount,
  sharedToday,
}: {
  userId: string
  hasWardrobe: boolean
  circleCount: number
  sharedToday: boolean
}) {
  if (!hasWardrobe) return null

  const { look } = await dailyLookFor(userId)
  if (!look) return null

  const supabase = await createClient()

  const signed = await signMany(
    supabase,
    BUCKETS.clothing,
    look.items.map((item) => item.imagePath).filter((p): p is string => Boolean(p)),
    userId,
  )

  return (
    <TodayLook
      look={{
        outfitId: look.outfitId,
        title: look.title,
        explanation: look.explanation,
        match: look.match,
        items: look.items.map((item) => ({
          id: item.id,
          name: item.name,
          imageUrl: item.imagePath ? (signed.get(item.imagePath) ?? null) : null,
        })),
      }}
      canShare={circleCount > 0}
      shared={sharedToday}
    />
  )
}

/**
 * El hueco mientras llega.
 *
 * Mismas medidas que la tarjeta de verdad —la rejilla de 96 + 96 píxeles, el
 * titular, la fila de botones— para que al sustituirse no se mueva nada. Un
 * hueco de otro tamaño es peor que ninguno: la página da un salto justo cuando
 * alguien iba a tocar algo.
 */
export function DailyLookSkeleton() {
  return (
    <div className="mt-5 rounded-[var(--radius-card)] bg-raised p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <Shimmer className="h-2 w-20" />
        <Shimmer className="h-2 w-14" />
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: '1.3fr 1fr', gridTemplateRows: '96px 96px' }}
      >
        <Shimmer className="h-full rounded-2xl" />
        <Shimmer className="h-full rounded-2xl" />
        <Shimmer className="h-full rounded-2xl" />
      </div>
      <Shimmer className="mt-3.5 h-5 w-2/3" />
      <Shimmer className="mt-2 h-3 w-full" />
      <Shimmer className="mt-4 h-[46px] rounded-full" />
    </div>
  )
}
