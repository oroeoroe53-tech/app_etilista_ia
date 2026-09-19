import { Screen } from '@/components/ui'
import { PageTitleSkeleton, WardrobeGridSkeleton, Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <PageTitleSkeleton />
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>
      <WardrobeGridSkeleton />
    </Screen>
  )
}
