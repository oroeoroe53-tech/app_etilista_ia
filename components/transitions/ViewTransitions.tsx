'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'

/**
 * Transiciones de vista.
 *
 * Next 16 todavía no expone la API de transiciones de React, así que se usa
 * `document.startViewTransition` a mano. Lo difícil no es llamarla: es saber
 * **cuándo ha terminado la navegación**.
 *
 * El primer intento esperaba dos fotogramas y no funcionaba: un Server Component
 * tarda bastante más en llegar, así que la transición se cerraba sobre una
 * pantalla que todavía no había cambiado y no se animaba nada.
 *
 * La forma fiable es esperar a que cambie la ruta de verdad. Por eso esto vive
 * en un proveedor del layout y no en cada enlace: el enlace se desmonta al
 * navegar, así que no puede ser él quien se entere de que la navegación acabó.
 *
 * Durante la captura la página se congela, así que hay un tope de tiempo: más
 * vale una transición cortada que una pantalla bloqueada esperando datos.
 */

const MAX_WAIT_MS = 700

interface TransitionContextValue {
  navigate: (href: string, prepare?: () => void, cleanup?: () => void) => void
}

const TransitionContext = createContext<TransitionContextValue | null>(null)

export function useViewTransition() {
  return useContext(TransitionContext)
}

export function ViewTransitions({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const resolveRef = useRef<(() => void) | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cuando la ruta cambia, la navegación ha terminado: se libera la transición.
  useEffect(() => {
    if (!resolveRef.current) return

    // Un fotograma más para que el navegador haya pintado el contenido nuevo.
    requestAnimationFrame(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      resolveRef.current?.()
      resolveRef.current = null
    })
  }, [pathname])

  const navigate = useCallback(
    (href: string, prepare?: () => void, cleanup?: () => void) => {
      const doc = document as Document & {
        startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> }
      }

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (typeof doc.startViewTransition !== 'function' || reducedMotion) {
        startTransition(() => router.push(href))
        return
      }

      prepare?.()

      const transition = doc.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            resolveRef.current = resolve

            // Tope de seguridad: si la página tarda demasiado, se suelta igual.
            timerRef.current = setTimeout(() => {
              resolveRef.current?.()
              resolveRef.current = null
            }, MAX_WAIT_MS)

            startTransition(() => router.push(href))
          }),
      )

      transition.finished.finally(() => cleanup?.())
    },
    [router],
  )

  return (
    <TransitionContext.Provider value={{ navigate }}>{children}</TransitionContext.Provider>
  )
}
