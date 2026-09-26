import { Screen } from '@/components/ui'
import { FormSkeleton, Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <div className="pt-5 pb-1">
        <Shimmer className="h-3 w-32 rounded" />
      </div>
      <div className="pt-4 pb-6">
        <Shimmer className="mb-3 h-2 w-20 rounded" />
        <Shimmer className="h-9 w-56 rounded" />
      </div>
      <Shimmer className="mb-6 h-[230px] w-full rounded-[24px]" />
      <FormSkeleton rows={7} />
    </Screen>
  )
}
