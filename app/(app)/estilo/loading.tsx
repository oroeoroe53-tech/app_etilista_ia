import { Screen } from '@/components/ui'
import { Shimmer } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <div className="pt-5 pb-5">
        <Shimmer className="mb-3 h-2 w-24 rounded" />
        <Shimmer className="h-8 w-40 rounded" />
        <Shimmer className="mt-1.5 h-8 w-48 rounded" />
      </div>

      <div className="mb-5 flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Shimmer className="h-11 w-11 rounded-full" />
            <Shimmer className="h-2 w-10 rounded" />
          </div>
        ))}
      </div>

      <Shimmer className="h-3.5 w-full rounded" />
      <Shimmer className="mt-2 h-3.5 w-4/5 rounded" />
      <Shimmer className="mt-2 h-3.5 w-3/5 rounded" />

      <div className="mt-9 space-y-2.5">
        <Shimmer className="h-2 w-24 rounded" />
        <Shimmer className="h-[108px] w-full rounded-[20px]" />
        <Shimmer className="h-[108px] w-full rounded-[20px]" />
      </div>
    </Screen>
  )
}
