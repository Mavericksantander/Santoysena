import { expect, test } from '@playwright/test'
import { signIn, todaysCode } from './pasos.ts'

test('sin conexión la aplicación abre, pero el código solo viene del servidor', async ({ page, context }) => {
  await page.goto('/')
  await signIn(page, 'Rosa')
  await page.getByLabel('Nombre de la familia').fill('Familia Pérez')
  await page.getByRole('button', { name: 'CREAR FAMILIA' }).click()
  const code = await todaysCode(page)

  // El teléfono ya guardó la aplicación y el service worker controla la página.
  // Estas expresiones corren dentro de la página, por eso van como texto.
  await page.waitForFunction('navigator.serviceWorker.controller !== null')

  // Lo guardado son archivos de la aplicación, de su misma dirección. Nada del servidor.
  const stored = await page.evaluate<string[]>(`(async () => {
    const urls = []
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url)
    }
    return urls
  })()`)
  const origin = new URL(page.url()).origin
  expect(stored.length).toBeGreaterThanOrEqual(4)
  for (const url of stored) expect(new URL(url).origin).toBe(origin)
  expect(stored).toContain(`${origin}/`)

  // Sin conexión la aplicación abre igual, y dice que no pudo cargar en vez de mostrar un código viejo.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar')
  await expect(page.getByTestId('codigo')).toHaveCount(0)
  for (const word of code) await expect(page.getByText(word)).toHaveCount(0)
  await page.screenshot({ path: 'e2e-resultados/7-sin-conexion.png' })

  // Al volver la conexión, el código vuelve del servidor.
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Intentar de nuevo' }).click()
  expect(await todaysCode(page)).toEqual(code)
})
