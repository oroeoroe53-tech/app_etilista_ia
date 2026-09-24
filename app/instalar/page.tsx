import Link from 'next/link'
import { InstallGuide } from '@/components/pwa/InstallGuide'
import { track } from '@/lib/observability/funnel'

/*
 * Dinámica, no estática. Se renderiza en cada visita porque cada visita se
 * cuenta: prerenderizada, `track()` se ejecutaría una vez en el build y nunca
 * más — y además `after()` necesita una petición de verdad para existir.
 */
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Llévatela al móvil · Selyqo',
  description: 'Cómo añadir Selyqo a la pantalla de inicio, sin pasar por ninguna tienda.',
}

/**
 * Cómo instalar la aplicación.
 *
 * Pública a propósito: la gente llega aquí desde un anuncio, antes de tener
 * cuenta. Pedirle que se registre para poder enterarse de cómo instalar la
 * aplicación sería pedirle las dos cosas más difíciles a la vez.
 *
 * No está en la barra de navegación. No es un destino de uso diario: es algo
 * que se hace una vez, el primer día, y ya no se vuelve.
 */
export default function InstallPage() {
  track('install_viewed')

  return (
    <main
      className="mx-auto w-full max-w-[30rem] pt-safe pb-16"
      style={{ paddingInline: 'var(--screen-gutter)' }}
    >
      <header className="pt-7 pb-6">
        <p className="eyebrow mb-2.5">Llévatela contigo</p>
        <h1 className="display text-display leading-[1.05]">
          Ponla en tu móvil
          <span className="display-italic block">como una aplicación</span>
        </h1>
        <p className="mt-3.5 text-small leading-[1.5] text-ink-soft">
          No hay que descargar nada de ninguna tienda, no ocupa sitio y no pide
          permisos. Es esta misma web, con su icono en la pantalla de inicio.
        </p>
      </header>

      <InstallGuide />

      {/* --- Qué cambia --------------------------------------------------- */}
      <section className="mt-10">
        <p className="eyebrow mb-3">Qué cambia</p>
        <ul className="space-y-2.5">
          <Gain title="Se abre desde su icono">
            Como cualquier otra aplicación del móvil, sin buscar la pestaña.
          </Gain>
          <Gain title="A pantalla completa">
            Sin la barra de direcciones comiéndose la parte de arriba.
          </Gain>
          <Gain title="Arranca antes">
            Y con la pantalla de la percha en lugar de un destello en blanco.
          </Gain>
        </ul>
        <p className="mt-5 text-micro leading-[1.5] text-ink-faint">
          Lo que no cambia: el armario y las propuestas viven en el servidor, así
          que sigue haciendo falta conexión. Sin ella te lo dirá, en vez de
          enseñarte datos viejos.
        </p>
      </section>

      <div className="mt-10 border-t border-line pt-6 text-center">
        <Link
          href="/"
          className="text-small text-ink-soft underline underline-offset-4"
        >
          Volver a la aplicación
        </Link>
      </div>
    </main>
  )
}

function Gain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="lift-paper rounded-[22px] border border-line p-3.5">
      <p className="display text-lead">{title}</p>
      <p className="mt-1 text-small leading-[1.5] text-ink-soft">{children}</p>
    </li>
  )
}
