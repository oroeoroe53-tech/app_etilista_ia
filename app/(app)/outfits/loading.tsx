import { Screen } from '@/components/ui'
import { PageTitleSkeleton, Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <PageTitleSkeleton />
      <Shimmer className="h-[132px] w-full rounded-[24px]" />
      <Shimmer className="mt-3.5 h-[132px] w-full rounded-[24px]" />
      <div className="mt-6 space-y-3.5">
        <Shimmer className="h-12 w-full rounded" />
        <Shimmer className="h-12 w-full rounded" />
      </div>
    </Screen>
  )
}
