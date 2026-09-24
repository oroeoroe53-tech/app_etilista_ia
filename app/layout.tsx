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
  /*
   * El icono no estaba declarado: la pestaña enseñaba el de por defecto y el
   * «Añadir a pantalla de inicio» de iOS se inventaba una miniatura de la
   * página. Los archivos los genera `scripts/build-icons.mjs` a partir del
   * logotipo, y ahí está explicado por qué son dos y no uno.
   */
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin zoom máximo: bloquearlo es un problema de accesibilidad real.
  viewportFit: 'cover',
  /*
   * Un solo color, no un par claro/oscuro.
   *
   * La identidad de la aplicación es el crema: la única pantalla negra es
   * "Descubre", y lo es como excepción deliberada. Si el sistema pudiera
   * cambiar el fondo entero según la preferencia del teléfono, esa excepción
   * dejaría de decir nada.
   */
  themeColor: '#f4f1ea',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${displaySerif.variable}`}>
      <body>
        {/*
          El navegador avisa de que la aplicación se puede instalar con
          `beforeinstallprompt`, y lo hace **antes** de que React se hidrate: si
          se esperara a montar un componente, el aviso ya habría pasado y no
          habría forma de ofrecer el botón de instalar.

          Por eso se escucha aquí, en línea, y se guarda. `/instalar` lo recoge.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaPrompt=e;window.dispatchEvent(new Event('pwa-installable'))})",
          }}
        />
        {/*
          Va en el HTML desde el primer byte, antes de cualquier JavaScript, para
          cubrir el destello blanco entre que se abre la aplicación y React monta
          la interfaz.

          Dos objetos y nada más: la percha cae, rebota, engancha en la barra, y
          solo entonces la barra se rellena. Todo con CSS; se desvanece sola, sin
          depender de que nada la quite.
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
