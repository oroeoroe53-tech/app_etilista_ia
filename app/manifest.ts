import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Estilista',
    short_name: 'Estilista',
    description: 'Enséñale cómo vistes y aprenderá a vestirte.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f1ea',
    theme_color: '#f4f1ea',
    lang: 'es',
    categories: ['lifestyle', 'shopping'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
