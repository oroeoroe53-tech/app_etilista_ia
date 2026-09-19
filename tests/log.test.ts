import { describe, it, expect, vi, afterEach } from 'vitest'
import { log, timed } from '@/lib/observability/log'

/**
 * Los logs acaban en el visor de Vercel, que no es un sitio privado.
 *
 * Estos tests existen porque la regla "no registrar datos personales" no se
 * sostiene sola: basta con que alguien pase el objeto equivocado a un log para
 * que el correo de una persona quede escrito en un servidor ajeno (PLAN.md §36).
 */

function captureLog() {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line) => lines.push(String(line)))
  vi.spyOn(console, 'warn').mockImplementation((line) => lines.push(String(line)))
  vi.spyOn(console, 'error').mockImplementation((line) => lines.push(String(line)))
  return lines
}

afterEach(() => vi.restoreAllMocks())

describe('formato', () => {
  it('escribe JSON de una sola línea', () => {
    const lines = captureLog()
    log.info({ event: 'prueba', userId: 'u1' })

    expect(lines).toHaveLength(1)
    expect(() => JSON.parse(lines[0]!)).not.toThrow()
    expect(lines[0]).not.toContain('\n')
  })

  it('incluye nivel, momento y evento', () => {
    const lines = captureLog()
    log.info({ event: 'ai.call' })

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.level).toBe('info')
    expect(parsed.event).toBe('ai.call')
    expect(parsed.at).toBeTruthy()
  })

  it('los errores van a console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log.error({ event: 'fallo', error: new Error('roto') })
    expect(spy).toHaveBeenCalled()
  })
})

describe('datos personales', () => {
  it('no escribe el correo', () => {
    const lines = captureLog()
    log.info({ event: 'alta', email: 'ana@ejemplo.com' })

    expect(lines[0]).not.toContain('ana@ejemplo.com')
    expect(lines[0]).toContain('[omitido]')
  })

  it('no escribe claves ni tokens', () => {
    const lines = captureLog()
    log.info({ event: 'x', apiKey: 'sk-secreta', token: 'abc123', secret: 'shh' })

    expect(lines[0]).not.toContain('sk-secreta')
    expect(lines[0]).not.toContain('abc123')
    expect(lines[0]).not.toContain('shh')
  })

  it('no escribe rutas de fotos', () => {
    const lines = captureLog()
    log.info({ event: 'subida', image_path: 'uuid/mi-foto.jpg' })

    expect(lines[0]).not.toContain('mi-foto.jpg')
  })

  it('no escribe lo que devuelve un modelo', () => {
    const lines = captureLog()
    log.info({ event: 'ai.call', text: 'camiseta negra oversize', prompt: 'analiza esto' })

    expect(lines[0]).not.toContain('camiseta negra')
    expect(lines[0]).not.toContain('analiza esto')
  })

  it('sí escribe identificadores: no dicen quién es nadie', () => {
    const lines = captureLog()
    log.info({ event: 'x', userId: '8d1f-uuid' })

    expect(lines[0]).toContain('8d1f-uuid')
  })

  it('resume los objetos anidados en vez de volcarlos', () => {
    const lines = captureLog()
    log.info({ event: 'x', payload: { email: 'ana@ejemplo.com', nested: { a: 1 } } })

    expect(lines[0]).not.toContain('ana@ejemplo.com')
    expect(lines[0]).toContain('[objeto]')
  })

  it('de un error registra el mensaje, no la traza', () => {
    // Una traza arrastra valores de variables, y entre ellos hay claves y rutas.
    const lines = captureLog()
    const error = new Error('algo ha fallado')
    log.error({ event: 'x', error })

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.errorMessage).toBe('algo ha fallado')
    expect(parsed.errorType).toBe('Error')
    expect(lines[0]).not.toContain('at Object')
  })

  it('aguanta que se lance algo que no es un Error', () => {
    const lines = captureLog()
    log.error({ event: 'x', error: 'cadena suelta' })

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.errorMessage).toBe('cadena suelta')
  })
})

describe('timed', () => {
  it('mide y devuelve el resultado', async () => {
    const lines = captureLog()
    const result = await timed('op', { userId: 'u1' }, async () => 42)

    expect(result).toBe(42)
    const parsed = JSON.parse(lines[0]!)
    expect(parsed.ok).toBe(true)
    expect(typeof parsed.durationMs).toBe('number')
  })

  it('registra el fallo y vuelve a lanzar', async () => {
    const lines = captureLog()

    await expect(
      timed('op', {}, async () => {
        throw new Error('roto')
      }),
    ).rejects.toThrow('roto')

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.ok).toBe(false)
    expect(parsed.errorMessage).toBe('roto')
  })
})
