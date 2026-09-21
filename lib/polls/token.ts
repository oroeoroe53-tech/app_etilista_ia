/**
 * El identificador que viaja en el enlace.
 *
 * Es lo único que separa una votación de quien no debería verla, así que no se
 * parece a los identificadores del resto de la aplicación:
 *
 *  · **Aleatorio de verdad.** `crypto.getRandomValues`, no `Math.random()`, que
 *    es predecible y no está pensado para esto.
 *  · **Doce caracteres de un alfabeto de treinta y dos** son sesenta bits. Para
 *    encontrar una votación probando harían falta miles de millones de intentos,
 *    y cada intento es una petición al servidor.
 *  · **Sin caracteres ambiguos** (`0/O`, `1/l/I`) y todo en minúscula, porque
 *    alguien lo va a dictar por teléfono o a teclearlo mirando otra pantalla.
 *
 * No se usa `gen_random_uuid()` porque un UUID en una URL ocupa treinta y seis
 * caracteres y este enlace se pega en un mensaje, donde la longitud se nota.
 */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const LENGTH = 12

export function newPollToken(): string {
  const bytes = new Uint8Array(LENGTH)
  crypto.getRandomValues(bytes)

  let out = ''
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
  return out
}

/**
 * ¿Esto tiene pinta de token?
 *
 * Se comprueba antes de ir a la base de datos: así una URL con basura se
 * responde con un «no existe» sin gastar una consulta, y de paso los intentos
 * de inyectar algo por la ruta ni llegan.
 */
export function looksLikeToken(value: string): boolean {
  if (value.length !== LENGTH) return false
  for (const char of value) {
    if (!ALPHABET.includes(char)) return false
  }
  return true
}
