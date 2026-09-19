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
        <div id="splash" aria-hidden>
          <span className="mark">Estilista</span>
          <span className="rule" />
        </div>
        {children}
      </body>
    </html>
  )
}
