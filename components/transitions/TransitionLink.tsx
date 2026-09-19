'use client'

import Link from 'next/link'
import { type MouseEvent, type ReactNode } from 'react'
import { useViewTransition } from './ViewTransitions'

/**
 * Enlace que anima la navegación.
 *
 * `sharedName` marca el elemento que debe *viajar* entre pantallas en lugar de
 * fundirse. El nombre se pone justo antes de navegar y se quita al terminar: si
 * las sesenta miniaturas del armario lo llevaran puesto a la vez, el navegador
 * tendría que capturar sesenta capas para animar una sola.
 *
 * Sin soporte del navegador, o con "reducir movimiento" activado, navega como
 * un enlace normal.
 */
interface TransitionLinkProps {
  href: string
  children: ReactNode
  className?: string
  /** Debe coincidir con el `view-transition-name` de la pantalla destino. */
  sharedName?: string
  /** Qué elemento de dentro del enlace viaja. Por defecto, la imagen. */
  sharedSelector?: string
  prefetch?: boolean
  'aria-label'?: string
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
  const transition = useViewTransition()

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    // Respeta abrir en pestaña nueva, descargar y el resto de gestos del navegador.
    if (
      !transition ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return
    }

    const anchor = event.currentTarget
    const shared = sharedName
      ? (anchor.querySelector(sharedSelector) as HTMLElement | null)
      : null

    event.preventDefault()

    transition.navigate(
      href,
      () => {
        if (shared && sharedName) shared.style.viewTransitionName = sharedName
      },
      () => {
        if (shared) shared.style.viewTransitionName = ''
      },
    )
  }

  return (
    <Link href={href} className={className} prefetch={prefetch} onClick={onClick} {...rest}>
      {children}
    </Link>
  )
}
