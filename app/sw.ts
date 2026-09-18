import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope

/**
 * Service worker.
 *
 * Alcance deliberadamente modesto (PLAN.md §33): se cachea el armazón de la
 * aplicación para que abra rápido y para que sin conexión se vea una pantalla
 * decente en vez de el dinosaurio del navegador.
 *
 * NO se intenta que la aplicación funcione entera sin red: las recomendaciones y
 * el armario viven en la base de datos, y una versión desincronizada del armario
 * sería peor que un mensaje honesto de "sin conexión".
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
