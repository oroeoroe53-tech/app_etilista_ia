import { describe, it, expect, beforeEach, vi } from 'vitest'
import { signOne, signMany, clearSignedUrlCache, forgetSignedUrls } from '@/lib/storage/signed'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Caché de URLs firmadas.
 *
 * Una URL firmada es una llave: quien la tiene, entra. Cachearlas ahorra unos
 * 70 ms por pantalla, pero abre una trampa — si la caché se indexara solo por
 * ruta, pedir la ruta de otra persona devolvería una URL válida **sin pasar por
 * RLS**, porque la comprobación ocurre al firmar y no al leer de la caché.
 *
 * Estos tests existen sobre todo por eso.
 */

/** Cliente falso que cuenta cuántas veces se le pide firmar. */
function fakeSupabase() {
  const calls = { one: 0, many: 0 }

  const client = {
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => {
          calls.one++
          return { data: { signedUrl: `https://firmado/${path}?t=${calls.one}` }, error: null }
        },
        createSignedUrls: async (paths: string[]) => {
          calls.many++
          return {
            data: paths.map((path) => ({ path, signedUrl: `https://firmado/${path}` })),
            error: null,
          }
        },
      }),
    },
  } as unknown as SupabaseClient

  return { client, calls }
}

beforeEach(() => clearSignedUrlCache())

describe('aislamiento entre usuarios', () => {
  it('la caché de una persona NO sirve la ruta de otra', async () => {
    // El caso peligroso. Si esto fallara, bastaría conocer una ruta ajena para
    // recibir una llave válida sin que el RLS llegara a intervenir.
    const { client, calls } = fakeSupabase()
    const ruta = 'alice-uuid/foto.jpg'

    await signOne(client, 'clothing-images', ruta, 'alice-uuid')
    expect(calls.one).toBe(1)

    // Bob pide exactamente la misma ruta: tiene que volver a firmarse, y esa
    // firma sí pasa por las políticas de Storage.
    await signOne(client, 'clothing-images', ruta, 'bob-uuid')
    expect(calls.one).toBe(2)
  })

  it('tampoco en lote', async () => {
    const { client, calls } = fakeSupabase()
    const rutas = ['alice-uuid/a.jpg', 'alice-uuid/b.jpg']

    await signMany(client, 'clothing-images', rutas, 'alice-uuid')
    await signMany(client, 'clothing-images', rutas, 'bob-uuid')

    expect(calls.many).toBe(2)
  })

  it('el mismo camino en otro bucket es otra entrada', async () => {
    const { client, calls } = fakeSupabase()

    await signOne(client, 'clothing-images', 'u/x.jpg', 'u')
    await signOne(client, 'generated-images', 'u/x.jpg', 'u')

    expect(calls.one).toBe(2)
  })
})

describe('ahorro', () => {
  it('no vuelve a firmar lo ya firmado', async () => {
    const { client, calls } = fakeSupabase()

    await signOne(client, 'clothing-images', 'u/x.jpg', 'u')
    await signOne(client, 'clothing-images', 'u/x.jpg', 'u')
    await signOne(client, 'clothing-images', 'u/x.jpg', 'u')

    expect(calls.one).toBe(1)
  })

  it('en lote solo pide lo que falta', async () => {
    const { client, calls } = fakeSupabase()

    await signMany(client, 'clothing-images', ['u/a.jpg', 'u/b.jpg'], 'u')
    const segunda = await signMany(
      client,
      'clothing-images',
      ['u/a.jpg', 'u/b.jpg', 'u/c.jpg'],
      'u',
    )

    // Dos peticiones en total, no dos por lote: la segunda solo pide 'c'.
    expect(calls.many).toBe(2)
    expect(segunda.size).toBe(3)
  })

  it('si todo está cacheado, no llama a Supabase', async () => {
    const { client, calls } = fakeSupabase()

    await signMany(client, 'clothing-images', ['u/a.jpg'], 'u')
    await signMany(client, 'clothing-images', ['u/a.jpg'], 'u')

    expect(calls.many).toBe(1)
  })

  it('sin userId funciona igual, pero sin cachear', async () => {
    // Es la vía de escape: quien no quiera caché, no pasa el identificador.
    const { client, calls } = fakeSupabase()

    await signOne(client, 'clothing-images', 'u/x.jpg')
    await signOne(client, 'clothing-images', 'u/x.jpg')

    expect(calls.one).toBe(2)
  })
})

describe('caducidad e invalidación', () => {
  it('lo cacheado expira antes que la propia firma', async () => {
    // Si caducaran a la vez, alguien podría recibir una URL a punto de expirar
    // y ver la imagen rota.
    const { client, calls } = fakeSupabase()

    await signOne(client, 'clothing-images', 'u/x.jpg', 'u')

    // Cuarenta y seis minutos después: la firma aún vale una hora, la caché no.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 46 * 60 * 1000)
    await signOne(client, 'clothing-images', 'u/x.jpg', 'u')
    vi.restoreAllMocks()

    expect(calls.one).toBe(2)
  })

  it('se puede olvidar lo de un usuario sin tocar lo de los demás', async () => {
    const { client, calls } = fakeSupabase()

    await signOne(client, 'clothing-images', 'a/x.jpg', 'a')
    await signOne(client, 'clothing-images', 'b/x.jpg', 'b')
    expect(calls.one).toBe(2)

    forgetSignedUrls('a')

    await signOne(client, 'clothing-images', 'b/x.jpg', 'b') // sigue cacheado
    expect(calls.one).toBe(2)

    await signOne(client, 'clothing-images', 'a/x.jpg', 'a') // se olvidó
    expect(calls.one).toBe(3)
  })
})

describe('robustez', () => {
  it('una lista vacía no llama a Supabase', async () => {
    const { client, calls } = fakeSupabase()
    const result = await signMany(client, 'clothing-images', [], 'u')

    expect(result.size).toBe(0)
    expect(calls.many).toBe(0)
  })

  it('descarta rutas vacías y repetidas', async () => {
    const { client } = fakeSupabase()
    const result = await signMany(
      client,
      'clothing-images',
      ['u/a.jpg', 'u/a.jpg', '', 'u/b.jpg'],
      'u',
    )
    expect(result.size).toBe(2)
  })

  it('si falla la firma devuelve null, no lanza', async () => {
    const client = {
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: { message: 'denegado' } }),
        }),
      },
    } as unknown as SupabaseClient

    expect(await signOne(client, 'clothing-images', 'u/x.jpg', 'u')).toBeNull()
  })
})
