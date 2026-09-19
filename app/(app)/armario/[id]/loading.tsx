import { Screen } from '@/components/ui'
import { ItemDetailSkeleton } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <div className="pt-6 pb-4" />
      <ItemDetailSkeleton />
    </Screen>
  )
}
