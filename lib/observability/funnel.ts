import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from './log'

/**
 * El embudo.
 *
 * Siete momentos del recorrido de alguien que llega desde un anuncio. Sirven
 * para responder a una sola pregunta —*¿dónde se queda la gente?*— y esa
 * pregunta no se puede contestar después: si no se mide desde el primer día
 * del lanzamiento, el primer día del lanzamiento se pierde.
 *
 * Lo que NO hace, a propósito:
 *
 *  · No guarda IP, navegador, pantalla ni referente. Solo qué pasó y cuándo.
 *  · No manda nada a terceros, así que no hace falta banner de cookies.
 *  · No bloquea la respuesta: se escribe con `after()`, cuando la página ya ha
 *    salido. Una medición nunca debe hacer esperar a quien está midiéndose.
 *  · No lanza. Si la tabla no existe o la base de datos falla, la aplicación
 *    sigue igual. Perder una estadística no puede romper una pantalla.
 */

export type FunnelEvent =
  | 'demo_viewed'
  | 'install_viewed'
  | 'registered'
  | 'photos_uploaded'
  | 'analysis_done'
  | 'first_proposal'
  | 'opened_day'
  /*
   * Los tres de la votación. `poll_voted` es el más valioso de todos: es
   * alguien que se ha registrado porque una amiga le pidió opinión, o sea el
   * boca a boca funcionando, y se ve aquí antes que en ningún otro sitio.
   */
  | 'poll_created'
  | 'poll_opened'
  | 'poll_voted'
  /*
   * El círculo. `circle_joined` es la otra mitad del boca a boca, junto a
   * `poll_voted`: gente que llega porque alguien de dentro la ha traído.
   */
  | 'circle_invited'
  | 'circle_joined'
  /*
   * Un préstamo aceptado es la señal más fuerte de que el círculo se usa de
   * verdad: dos personas, un objeto físico y una conversación fuera de aquí.
   */
  | 'loan_requested'
  | 'loan_accepted'
  | 'event_created'
  | 'event_joined'

export function track(event: FunnelEvent, userId?: string | null): void {
  after(async () => {
    try {
      const supabase = createAdminClient()
      const { error } = await supabase
        .from('funnel_events')
        .insert({ event, user_id: userId ?? null })

      if (error) {
        // `warn` y no `error`: esto no es un fallo del producto.
        log.warn({ event: 'funnel.write_failed', reason: error.message })
      }
    } catch {
      log.warn({ event: 'funnel.write_failed' })
    }
  })
}
