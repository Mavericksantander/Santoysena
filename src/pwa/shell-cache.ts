// Qué guarda el teléfono para abrir la aplicación sin conexión: solo los
// archivos de la aplicación listados al construirla. El código del día viene
// siempre del servidor y nunca pasa por aquí.

export const CACHE_PREFIX = 'santo-y-sena-app-'

export interface ShellManifest {
  /** Cambia cuando cambia cualquier archivo de la aplicación. */
  version: string
  /** Rutas relativas a la carpeta de la aplicación. `./` es la página. */
  files: string[]
}

interface CacheLike {
  addAll(urls: string[]): Promise<void>
  match(url: string): Promise<Response | undefined>
}

export interface CachesLike {
  open(name: string): Promise<CacheLike>
  keys(): Promise<string[]>
  delete(name: string): Promise<boolean>
}

export interface ShellRequest {
  method: string
  url: string
}

export function shellCache(caches: CachesLike, scope: string, manifest: ShellManifest) {
  const name = CACHE_PREFIX + manifest.version
  const known = new Set(manifest.files.map((file) => new URL(file, scope).href))

  return {
    /** Guarda todos los archivos de esta versión. Si uno falla, no queda instalada. */
    install: async (): Promise<void> => (await caches.open(name)).addAll([...known]),

    /** Borra las versiones anteriores de la aplicación. */
    async activate(): Promise<void> {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== name) await caches.delete(key)
      }
    },

    /**
     * Dirección guardada que responde a esta petición, o `null` si no es un
     * archivo de la aplicación. Lo que no es de la aplicación va directo a la
     * red, sin pasar por el service worker.
     */
    fileFor(request: ShellRequest): string | null {
      if (request.method !== 'GET') return null
      const url = new URL(request.url)
      url.search = ''
      url.hash = ''
      return known.has(url.href) ? url.href : null
    },

    /** La copia guardada de un archivo de la aplicación, si el teléfono todavía la tiene. */
    read: async (file: string): Promise<Response | undefined> => (await caches.open(name)).match(file),
  }
}
