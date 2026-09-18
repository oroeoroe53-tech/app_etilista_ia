import { Screen, PageTitle, EmptyState } from '@/components/ui'

/** Outfits — el deslizar llega en la Fase 7, el motor que los genera en la Fase 5. */
export default function OutfitsPage() {
  return (
    <Screen>
      <PageTitle eyebrow="Descubre" title="Outfits" />
      <EmptyState
        title="Aún no hay nada que enseñarte"
        body="Cuando tu armario tenga prendas suficientes, aquí podrás deslizar combinaciones y decirme cuáles te gustan."
      />
    </Screen>
  )
}
