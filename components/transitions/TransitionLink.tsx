'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useCallback, type MouseEvent, type ReactNode } from 'react'

/**
 * Enlace con transición de vista.
 *
 * Next 16 todavía no expone la API de transiciones de React, así que se usa
 * `document.startViewTransition` directamente. Los navegadores que no la tienen
 * —Firefox hoy— navegan como siempre: la comprobación de abajo es la que hace
 * que eso sea una degradación y no un fallo.
 *
 * `sharedName` marca el elemento que debe *viajar* entre pantallas en lugar de
 * fundirse. El nombre se pone justo antes de navegar y se quita al volver: si
 * las sesenta miniaturas del armario lo llevaran puesto a la vez, el navegador
 * tendría que capturar sesenta capas para animar una.
 */
interface TransitionLinkProps {
  href: string
  children: ReactNode
  className?: string
  /** Nombre compartido del elemento que viaja. Debe coincidir en la pantalla destino. */
  sharedName?: string
  /** Selector del elemento a marcar dentro del enlace. Por defecto, la imagen. */
  sharedSelector?: string
  prefetch?: boolean
  'aria-label'?: string
}

function supportsViewTransitions(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
      'function'
  )
}

export function TransitionLink({
  href,
  children,
  className,
  sharedName,
  sharedSelector = 'img',
  prefetch,
  ...rest
}: TransitionLinkProps) {
  const router = useRouter()

  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      // Respeta abrir en pestaña nueva, descargar, etc.
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return
      }

      if (!supportsViewTransitions()) return

      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      if (prefersReducedMotion) return

      event.preventDefault()

      const anchor = event.currentTarget
      const shared = sharedName
        ? (anchor.querySelector(sharedSelector) as HTMLElement | null)
        : null

      if (shared && sharedName) shared.style.viewTransitionName = sharedName

      const transition = (
        document as Document & {
          startViewTransition: (cb: () => Promise<void> | void) => { finished: Promise<void> }
        }
      ).startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            startTransition(() => {
              router.push(href)
              // Dos fotogramas: el primero encola el render, el segundo confirma
              // que ya se ha pintado. Sin esto el navegador fotografía la pantalla
              // antigua y la animación sale en blanco.
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            })
          }),
      )

      transition.finished.finally(() => {
        if (shared) shared.style.viewTransitionName = ''
      })
    },
    [href, router, sharedName, sharedSelector],
  )

  return (
    <Link href={href} className={className} prefetch={prefetch} onClick={onClick} {...rest}>
      {children}
    </Link>
  )
}
