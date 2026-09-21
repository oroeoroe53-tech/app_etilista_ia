/**
 * «sábado 27 de septiembre».
 *
 * Sin año, porque todo lo que se organiza aquí cae dentro de unos meses y el
 * año solo alarga la línea. Se fija el mediodía al convertir: con la medianoche,
 * una zona horaria por detrás de UTC enseñaría el día anterior.
 */
export function formatEventDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}
