export const metadata = { title: 'Sin conexión · Selyqo' }

/**
 * Pantalla que sirve el service worker cuando no hay red (PLAN.md §33).
 * Honesta a propósito: el armario y las recomendaciones viven en el servidor,
 * y enseñar datos viejos sería peor que decir la verdad.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 text-center">
      <h1 className="display mb-3 text-3xl">Sin conexión</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        Tu armario está a salvo. En cuanto vuelvas a tener internet, sigue donde lo dejaste.
      </p>
    </main>
  )
}
