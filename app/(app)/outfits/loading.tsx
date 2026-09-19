import { Screen } from '@/components/ui'
import { PageTitleSkeleton, Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <PageTitleSkeleton />
      <Shimmer className="mb-3 h-32 w-full rounded-[var(--radius-card)]" />
      <Shimmer className="mb-8 h-28 w-full rounded-[var(--radius-card)]" />
      <Shimmer className="h-2.5 w-24 rounded" />
    </Screen>
  )
}
