import { Screen } from '@/components/ui'
import { PageTitleSkeleton, OutfitListSkeleton } from '@/components/ui/Skeletons'

export default function Loading() {
  return (
    <Screen>
      <PageTitleSkeleton />
      <OutfitListSkeleton />
    </Screen>
  )
}
