/**
 * Une clases condicionales.
 *
 * Deliberadamente sin `clsx` ni `tailwind-merge`: son dos dependencias para algo
 * que cabe en ocho líneas, y el proyecto no tiene conflictos de clases que
 * resolver porque los componentes de `components/ui` no aceptan sobrescrituras
 * arbitrarias de estilo.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
