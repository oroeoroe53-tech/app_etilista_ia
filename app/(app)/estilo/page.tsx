import { Screen, PageTitle, EmptyState } from '@/components/ui'

/**
 * Estilo — Fase 4.
 *
 * Nota de producto (PLAN.md §16 y §42): los pesos internos del perfil no se
 * enseñan como números. Aquí se mostrará el estilo en lenguaje humano, no un
 * panel de métricas.
 */
export default function StylePage() {
  return (
    <Screen>
      <PageTitle eyebrow="Cómo vistes" title="Estilo" />
      <EmptyState
        title="Todavía te estoy conociendo"
        body="Con tus fotos, tus prendas y lo que vayas marcando, iré afinando lo que te sienta bien."
      />
    </Screen>
  )
}
