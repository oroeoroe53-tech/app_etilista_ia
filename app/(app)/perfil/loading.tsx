import { Screen } from '@/components/ui'
import { Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <div className="pt-5 pb-5">
        <Shimmer className="mb-3 h-2 w-20 rounded" />
        <div className="flex items-start justify-between gap-4">
          <Shimmer className="h-10 w-40 rounded" />
          <Shimmer className="h-8 w-36 rounded" />
        </div>
      </div>
      <Shimmer className="h-[268px] w-full rounded-[24px]" />
      <Shimmer className="mt-4 h-[54px] w-full rounded-full" />
    </Screen>
  )
}
