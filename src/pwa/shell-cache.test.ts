import { beforeEach, describe, expect, test } from 'vitest'
import { CACHE_PREFIX, type CachesLike, shellCache } from './shell-cache.ts'

const SCOPE = 'https://app.test/familia/'
const MANIFEST = { version: 'v2', files: ['./', 'assets/main-abc.js', 'icono.svg'] }
const CURRENT = `${CACHE_PREFIX}v2`

/** Almacén falso: un mapa de direcciones por cada caché con nombre. */
let stores: Map<string, Map<string, Response>>
let failToDownload: boolean
const caches: CachesLike = {
  open: (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)!
    return Promise.resolve({
      addAll: (urls) => {
        if (failToDownload) return Promise.reject(new TypeError('fetch failed'))
        for (const url of urls) store.set(url, new Response(`contenido de ${url}`))
        return Promise.resolve()
      },
      match: (url) => Promise.resolve(store.get(url)),
    })
  },
  keys: () => Promise.resolve([...stores.keys()]),
  delete: (name) => Promise.resolve(stores.delete(name)),
}
const shell = () => shellCache(caches, SCOPE, MANIFEST)
const get = (url: string) => ({ method: 'GET', url })

beforeEach(() => {
  stores = new Map()
  failToDownload = false
})

describe('instalación', () => {
  test('guarda los archivos de la lista, relativos a la carpeta de la aplicación', async () => {
    await shell().install()
    expect([...stores.keys()]).toEqual([CURRENT])
    expect([...stores.get(CURRENT)!.keys()]).toEqual([
      'https://app.test/familia/',
      'https://app.test/familia/assets/main-abc.js',
      'https://app.test/familia/icono.svg',
    ])
  })

  test('si un archivo no se puede bajar, la instalación falla', async () => {
    failToDownload = true
    await expect(shell().install()).rejects.toThrow('fetch failed')
  })
})

describe('activación', () => {
  test('borra las versiones anteriores y no toca lo que no es suyo', async () => {
    stores.set(`${CACHE_PREFIX}v1`, new Map())
    stores.set('otra-cosa', new Map())
    await shell().install()
    await shell().activate()
    expect([...stores.keys()].sort()).toEqual(['otra-cosa', CURRENT])
  })
})

describe('qué peticiones responde el teléfono sin ir a la red', () => {
  test('la página, aunque la dirección traiga parámetros o una ruta interna', () => {
    expect(shell().fileFor(get(SCOPE))).toBe(SCOPE)
    expect(shell().fileFor(get(`${SCOPE}?desde=inicio#/familia`))).toBe(SCOPE)
  })

  test('los archivos de la lista', () => {
    expect(shell().fileFor(get(`${SCOPE}assets/main-abc.js`))).toBe(`${SCOPE}assets/main-abc.js`)
  })

  test('nada que no esté en la lista: ni otro archivo, ni otra carpeta, ni otro servidor', () => {
    expect(shell().fileFor(get(`${SCOPE}assets/otro.js`))).toBeNull()
    expect(shell().fileFor(get('https://app.test/icono.svg'))).toBeNull()
    expect(shell().fileFor(get('https://servidor.test/functions/v1/get-family-code'))).toBeNull()
    expect(shell().fileFor(get('https://servidor.test/familia/icono.svg'))).toBeNull()
  })

  test('ninguna petición que no sea GET, ni siquiera a la página', () => {
    expect(shell().fileFor({ method: 'POST', url: SCOPE })).toBeNull()
    expect(shell().fileFor({ method: 'HEAD', url: `${SCOPE}icono.svg` })).toBeNull()
  })
})

describe('lectura', () => {
  test('entrega la copia guardada de esta versión', async () => {
    await shell().install()
    const stored = await shell().read(`${SCOPE}icono.svg`)
    expect(await stored!.text()).toBe(`contenido de ${SCOPE}icono.svg`)
  })

  test('no entrega copias de una versión anterior', async () => {
    await shellCache(caches, SCOPE, { ...MANIFEST, version: 'v1' }).install()
    expect(await shell().read(`${SCOPE}icono.svg`)).toBeUndefined()
  })
})
