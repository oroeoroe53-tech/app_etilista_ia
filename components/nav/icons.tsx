/**
 * Los iconos de las barras.
 *
 * Viven aquí y no dentro de `BottomNav` porque hay dos barras —la de la
 * aplicación y la de la demostración— y la segunda existe para que lo que se
 * está viendo sin cuenta se lea como la aplicación y no como un folleto sobre
 * la aplicación. Si cada una dibuja sus propios iconos, esa promesa dura hasta
 * el primer retoque en una de ellas.
 *
 * Todos de línea, mismo grosor y misma caja de 24×24: ninguno debe pesar más
 * que otro salvo el que ocupa el disco.
 */
export const NAV_ICONS = {
  inicio: 'M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',

  // Una percha: el único objeto que significa "armario" sin ambigüedad.
  armario:
    'M12 4.5a2 2 0 0 0-2 2c0 1 .8 1.7 2 2v2m0 0L3.6 16.1a1 1 0 0 0 .6 1.8h15.6a1 1 0 0 0 .6-1.8L12 10.5z',

  /*
   * Una chispa. No describe un outfit —nada lo hace en 24 píxeles— pero sí
   * describe lo que pasa al pulsar, que es lo que importa en el botón que
   * carga el gesto principal.
   */
  outfits:
    'M12 3.2l1.9 4.9 4.9 1.9-4.9 1.9L12 16.8l-1.9-4.9L5.2 10l4.9-1.9zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',

  social:
    'M9 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 9 11m7.2-.4a2.8 2.8 0 1 0 0-5.6M2.8 19.4c0-2.7 2.8-4.3 6.2-4.3s6.2 1.6 6.2 4.3M17 15.4c2.6.3 4.2 1.6 4.2 3.6',

  perfil:
    'M12 11.8a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8M4.8 20.4c0-3.2 3.2-5.2 7.2-5.2s7.2 2 7.2 5.2',
} as const

export type NavIconName = keyof typeof NAV_ICONS

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[21px] w-[21px]"
    >
      <path d={NAV_ICONS[name]} />
    </svg>
  )
}
