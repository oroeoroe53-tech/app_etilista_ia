import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Serif } from 'next/font/google'
import './globals.css'
import './splash.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const displaySerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Estilista',
  description: 'Enséñale cómo vistes y aprenderá a vestirte.',
  applicationName: 'Estilista',
  appleWebApp: {
    capable: true,
    title: 'Estilista',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin zoom máximo: bloquearlo es un problema de accesibilidad real.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#131215' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${displaySerif.variable}`}>
      <body>
        {/*
          Va en el HTML desde el primer byte, antes de cualquier JavaScript, para
          cubrir el destello blanco entre que el sistema suelta la pantalla de
          arranque y React monta la aplicación. Se desvanece sola con CSS y solo
          aparece en la PWA instalada.
        */}
        {/*
          Va en el HTML desde el primer byte, antes de cualquier JavaScript, para
          cubrir el destello blanco entre que el sistema suelta su pantalla de
          arranque y React monta la aplicación.

          Dos objetos y nada más: la percha cae, rebota, engancha en la barra, y
          solo entonces la barra se rellena. Todo con CSS; se desvanece sola.
        */}
        <div id="splash" aria-hidden>
          <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
            {/* La barra: primero solo su contorno, luego se rellena */}
            <rect className="bar-outline" x="22" y="34" width="156" height="11" rx="5.5" />
            <rect className="bar-fill" x="22" y="34" width="156" height="11" rx="5.5" />

            {/*
              La percha va DESPUÉS de la barra para quedar por encima: así el
              gancho se ve cerrándose alrededor y no atravesándola. El gancho
              baja por el otro lado hasta pasar el borde inferior de la barra —
              sin eso, la percha parece atravesada en vez de colgada.
            */}
            <g className="drop">
              <g className="swing">
                <path className="hanger" d="M100 66 V30 Q100 19 89 19 Q78 19 78 31 V45" />
                <path className="hanger" d="M100 66 L50 112 H150 Z" />
              </g>
            </g>
          </svg>
        </div>
        {children}
      </body>
    </html>
  )
}
