import { Screen } from '@/components/ui'
import { PageTitleSkeleton, WardrobeGridSkeleton, Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <PageTitleSkeleton />
      {/* Dos tiras de filtros, a la altura exacta de las de verdad. */}
      {Array.from({ length: 2 }).map((_, row) => (
        <div key={row} className="mb-[7px] flex gap-[6px] overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} className="h-[34px] w-20 shrink-0 rounded-full" />
          ))}
        </div>
      ))}
      <div className="mt-5">
        <WardrobeGridSkeleton />
      </div>
    </Screen>
  )
}
