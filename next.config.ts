import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

/**
 * El host de Supabase Storage se deriva de la URL del proyecto.
 * Se lee de forma tolerante: durante un build sin `.env.local` (por ejemplo, un
 * `npm run build` de comprobación antes de conectar Supabase) la app debe compilar igual.
 */
function supabaseImagePattern() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return []
  try {
    return [
      {
        protocol: 'https' as const,
        hostname: new URL(url).hostname,
        pathname: '/storage/v1/object/**',
      },
    ]
  } catch {
    return []
  }
}

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // En desarrollo el service worker estorba más que ayuda (caché de rutas en caliente).
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * Next 16 usa Turbopack por defecto, y Serwist todavía añade configuración de
   * webpack. Convivencia elegida:
   *   · `npm run dev`   → Turbopack (Serwist está desactivado en desarrollo, así
   *                       que su configuración de webpack no hace falta)
   *   · `npm run build` → webpack, que es lo que Serwist necesita para empaquetar
   *                       el service worker
   * Este objeto vacío es lo que le dice a Next que la convivencia es intencionada.
   */
  turbopack: {},
  images: {
    remotePatterns: supabaseImagePattern(),
    // Las fotos del armario se muestran a tamaños pequeños en un grid móvil.
    imageSizes: [64, 96, 128, 192, 256],
    deviceSizes: [360, 414, 640, 828, 1080],
  },
  serverExternalPackages: ['sharp'],
}

export default withSerwist(nextConfig)
