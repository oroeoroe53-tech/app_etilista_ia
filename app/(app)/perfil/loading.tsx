import { Screen } from '@/components/ui'
import { PageTitleSkeleton, Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <PageTitleSkeleton />
      <Shimmer className="mb-4 h-20 w-full rounded-[var(--radius-card)]" />
      <Shimmer className="mb-4 h-64 w-full rounded-[var(--radius-card)]" />
      <Shimmer className="h-12 w-full rounded-full" />
    </Screen>
  )
}
