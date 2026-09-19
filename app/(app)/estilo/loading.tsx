import { Screen } from '@/components/ui'
import { PageTitleSkeleton, Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <PageTitleSkeleton />
      <Shimmer className="mb-5 h-9 w-56 rounded" />
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-11 w-11 rounded-full" />
        ))}
      </div>
      <Shimmer className="h-3 w-full rounded" />
      <Shimmer className="mt-2 h-3 w-4/5 rounded" />
      <Shimmer className="mt-2 h-3 w-3/5 rounded" />
    </Screen>
  )
}
