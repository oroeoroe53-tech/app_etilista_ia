/**
 * La luz de detrás del titular.
 *
 * Va en un componente y no suelta en cada pantalla porque el truco depende de
 * dos cosas que es fácil olvidar al copiarlo: el contenedor tiene que ser
 * `relative`, y el contenido que va encima tiene que quedar por delante. Si se
 * olvida lo segundo, la veladura tapa el titular.
 *
 * Solo dibuja: no ocupa sitio en el flujo ni recibe puntero.
 */
export function HeaderLight() {
  return <span aria-hidden className="header-light" />
}
