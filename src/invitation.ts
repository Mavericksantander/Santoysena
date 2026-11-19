// La invitación viaja en el fragmento (#) del enlace. El fragmento no se
// envía al servidor que entrega la página, así que el token no queda en sus
// registros ni en los de un intermediario.

const ROUTE = '#/unirse/'
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const STORAGE_KEY = 'santo-y-sena.invitacion'

export function invitationLink(token: string, location: Pick<Location, 'origin' | 'pathname'>): string {
  return `${location.origin}${location.pathname}${ROUTE}${token}`
}

/** Token de un enlace de invitación, o null si el fragmento no es una invitación bien formada. */
export function tokenFromHash(hash: string): string | null {
  if (!hash.startsWith(ROUTE)) return null
  const token = hash.slice(ROUTE.length)
  return TOKEN.test(token) ? token : null
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** La invitación espera aquí mientras la persona inicia sesión. Se borra al cerrar la pestaña. */
export const pendingInvitation = {
  get: (): string | null => sessionStorage.getItem(STORAGE_KEY),
  set: (token: string) => {
    sessionStorage.setItem(STORAGE_KEY, token)
    notify()
  },
  clear: () => {
    sessionStorage.removeItem(STORAGE_KEY)
    notify()
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/**
 * Si el enlace abierto es una invitación, la guarda y la saca de la barra de
 * direcciones y del historial, para que no quede a la vista.
 */
export function captureInvitation(): void {
  const token = tokenFromHash(window.location.hash)
  if (!token) return
  pendingInvitation.set(token)
  window.history.replaceState(null, '', `${window.location.pathname}#/`)
}
