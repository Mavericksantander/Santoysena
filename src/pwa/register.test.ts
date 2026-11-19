import { expect, test, vi } from 'vitest'
import { registerServiceWorker } from './register.ts'

type Register = ServiceWorkerContainer['register']

test('registra el service worker en la carpeta de la aplicación', () => {
  const register = vi.fn<Register>(() => Promise.resolve({} as ServiceWorkerRegistration))
  registerServiceWorker({ register }, '/Santoysena/')
  expect(register.mock.calls).toEqual([['/Santoysena/sw.js']])
})

test('en un navegador sin service workers no hace nada', () => {
  expect(() => registerServiceWorker(undefined, '/')).not.toThrow()
})

// Vitest hace fallar la corrida completa si queda una promesa rechazada sin atender.
test('si el registro falla, la aplicación sigue sin enterarse', async () => {
  registerServiceWorker({ register: () => Promise.reject(new Error('sin permiso')) }, '/')
  await new Promise((resolve) => setTimeout(resolve))
})
