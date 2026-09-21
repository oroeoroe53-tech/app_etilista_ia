/**
 * A dónde volver después de entrar o registrarse.
 *
 * Existe por la votación: quien llega desde el enlace de una amiga estaba
 * mirando unas fotos y quería decir cuál le gusta. Mandarle a la pantalla de
 * inicio después de registrarse sería hacerle empezar de cero justo cuando ya
 * había decidido.
 *
 * **Solo rutas internas.** El valor viene de la URL, o sea de cualquiera, y un
 * destino sin filtrar convierte esta aplicación en un trampolín para mandar
 * gente a sitios ajenos con la credibilidad del dominio propio. Tiene que
 * empezar por una barra y no por dos (`//otro.sitio` es una URL absoluta
 * disfrazada de ruta).
 *
 * Vive aquí y no junto a las acciones porque un archivo `'use server'` solo
 * puede exportar funciones asíncronas: todo lo que exporte se convierte en un
 * punto de entrada desde el navegador, y esto no lo es.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}
