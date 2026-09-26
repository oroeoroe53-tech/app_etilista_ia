import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * La puerta de atrás clásica.
 *
 * Pedirle al servidor que abra una dirección escrita por otra persona lo
 * convierte en un recadero que llega a sitios internos. Estas pruebas son la
 * red que impide que una refactorización futura abra esa puerta sin enterarse.
 *
 * El nombre se resuelve con un doble, así que no hay red de por medio.
 */

const lookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns/promises', () => ({ lookup }))

const { assertPublicUrl, UnsafeUrlError } = await import('@/lib/net/safe-fetch')

/** Una dirección pública cualquiera, para el caso normal. */
function resuelveA(...ips: string[]) {
  lookup.mockResolvedValue(ips.map((address) => ({ address, family: 4 })))
}

beforeEach(() => {
  lookup.mockReset()
  resuelveA('93.184.216.34')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('assertPublicUrl', () => {
  it('deja pasar una tienda normal', async () => {
    const url = await assertPublicUrl('https://www.zara.com/es/falda.html')
    expect(url.hostname).toBe('www.zara.com')
  })

  it('rechaza lo que no sea http o https', async () => {
    for (const raw of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'ftp://tienda.com/x',
      'data:text/html,<b>x',
    ]) {
      await expect(assertPublicUrl(raw)).rejects.toBeInstanceOf(UnsafeUrlError)
    }
  })

  it('rechaza un texto que no es una dirección', async () => {
    await expect(assertPublicUrl('no me acuerdo')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('rechaza credenciales metidas en el enlace', async () => {
    await expect(
      assertPublicUrl('https://usuario:clave@tienda.com/x'),
    ).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('rechaza las direcciones internas escritas a pelo', async () => {
    const internas = [
      'http://127.0.0.1:6379/',
      'http://localhost/',
      'http://169.254.169.254/latest/meta-data/', // las claves de la máquina
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://0.0.0.0/',
      'http://100.64.0.1/',
      'http://[::1]/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:127.0.0.1]/', // IPv4 disfrazada de IPv6
      'http://[::ffff:7f00:1]/', // la misma, en hexadecimal: es como la deja new URL
      'http://[64:ff9b::7f00:1]/', // y por el prefijo de traduccion
      'http://[100::1]/',
    ]

    for (const raw of internas) {
      // `localhost` pasa por el resolutor; el resto se cortan sin preguntar.
      lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
      await expect(assertPublicUrl(raw), raw).rejects.toBeInstanceOf(UnsafeUrlError)
    }
  })

  it('rechaza un nombre público que apunta a una dirección interna', async () => {
    // Es el ataque de verdad: el dominio es tuyo y lo apuntas a 127.0.0.1.
    resuelveA('127.0.0.1')
    await expect(assertPublicUrl('https://mi-dominio.com/x')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    )
  })

  it('basta con que UNA de las direcciones sea interna', async () => {
    // Con varias no se controla con cuál se queda el sistema al conectar.
    resuelveA('93.184.216.34', '10.0.0.1')
    await expect(assertPublicUrl('https://mixto.com/x')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    )
  })

  it('un nombre que no existe no pasa', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'))
    await expect(assertPublicUrl('https://no-existe.test/x')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    )
  })

  it('un nombre que no resuelve a nada no pasa', async () => {
    lookup.mockResolvedValue([])
    await expect(assertPublicUrl('https://vacio.com/x')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    )
  })

  it('una dirección IPv6 de internet sí pasa', async () => {
    // 2000::/3 es el único rango de internet; el resto no se deja entrar.
    const url = await assertPublicUrl('https://[2606:4700::1111]/x')
    expect(url.hostname).toBe('[2606:4700::1111]')
  })

  it('una dirección pública escrita a pelo sí pasa', async () => {
    const url = await assertPublicUrl('https://93.184.216.34/x')
    expect(url.hostname).toBe('93.184.216.34')
    // No hace falta preguntar por un nombre que no hay.
    expect(lookup).not.toHaveBeenCalled()
  })
})
