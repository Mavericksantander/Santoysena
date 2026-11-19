import { randomUUID } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { codeIn, latestMailTo } from './correo.ts'

const WORD = /^[A-ZÑÁÉÍÓÚÜ]{4,10}$/

async function signIn(page: Page, name: string): Promise<string> {
  const email = `${randomUUID()}@example.com`
  await page.getByLabel('Tu nombre, como te dice tu familia').fill(name)
  await page.getByLabel('Tu correo').fill(email)
  await page.getByRole('button', { name: 'ENVIARME UN CÓDIGO' }).click()
  await expect(page.getByLabel('Código del correo')).toBeVisible()

  const mail = await latestMailTo(email)
  expect(mail.subject).toBe('Tu código para entrar a Santo y Seña')
  // El correo trae un código para escribir, no un enlace para apretar.
  expect(mail.html).not.toMatch(/href=/i)

  await page.getByLabel('Código del correo').fill(codeIn(mail))
  await page.getByRole('button', { name: 'ENTRAR' }).click()
  return email
}

async function todaysCode(page: Page): Promise<string[]> {
  const code = page.getByTestId('codigo')
  await expect(code).toBeVisible()
  const words = await code.locator('span').allTextContents()
  expect(words).toHaveLength(2)
  for (const word of words) expect(word).toMatch(WORD)
  return words
}

test('dos personas de una familia entran con su correo y ven el mismo código', async ({ page, browser }) => {
  // Rosa entra por primera vez y crea la familia.
  await page.goto('/')
  await expect(page.getByRole('note')).toHaveCount(0)
  await signIn(page, 'Rosa')
  await expect(page.getByText('Todavía no perteneces a ninguna familia.')).toBeVisible()
  await page.getByLabel('Nombre de la familia').fill('Familia Pérez')
  await page.getByRole('button', { name: 'CREAR FAMILIA' }).click()

  const rosasCode = await todaysCode(page)
  await expect(page.getByText('Familia Pérez')).toBeVisible()
  await expect(page.getByText(/^Válido hasta las \d{2}:\d{2}$/)).toBeVisible()
  await page.screenshot({ path: 'e2e-resultados/1-codigo-de-rosa.png' })

  // Rosa crea una invitación.
  await page.getByRole('link', { name: 'MI FAMILIA' }).click()
  await page.getByRole('button', { name: 'CREAR INVITACIÓN' }).click()
  const link = (await page.getByTestId('enlace').textContent())!
  expect(new URL(link).hash).toMatch(/^#\/unirse\/[A-Za-z0-9_-]{43}$/)
  await page.screenshot({ path: 'e2e-resultados/2-invitacion.png', fullPage: true })

  // Camila abre el enlace en otro teléfono, entra y acepta.
  const camilasPhone = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'es-CL' })
  const camila = await camilasPhone.newPage()
  await camila.goto(link)
  await expect(camila).toHaveURL(/#\/$/)
  await signIn(camila, 'Camila')
  await expect(camila.getByText('Te invitaron a una familia')).toBeVisible()
  await camila.getByRole('button', { name: 'UNIRME A LA FAMILIA' }).click()

  expect(await todaysCode(camila)).toEqual(rosasCode)
  await camila.screenshot({ path: 'e2e-resultados/3-codigo-de-camila.png' })

  // Rosa ve a Camila en su familia, y Camila, que no administra, no puede invitar.
  await page.reload()
  await expect(page.getByRole('list', { name: 'Miembros' }).getByRole('listitem')).toHaveText([
    /Rosa.*Creó la familia/,
    /Camila.*Miembro/,
  ])
  await camila.getByRole('link', { name: 'MI FAMILIA' }).click()
  await expect(camila.getByRole('list', { name: 'Miembros' })).toBeVisible()
  await expect(camila.getByRole('button', { name: 'CREAR INVITACIÓN' })).toHaveCount(0)

  // La misma invitación no sirve para una tercera persona.
  const strangersPhone = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'es-CL' })
  const stranger = await strangersPhone.newPage()
  await stranger.goto(link)
  await signIn(stranger, 'Intruso')
  await stranger.getByRole('button', { name: 'UNIRME A LA FAMILIA' }).click()
  await expect(stranger.getByRole('alert')).toContainText('Esta invitación ya no sirve')
  await expect(stranger.getByTestId('codigo')).toHaveCount(0)

  // Al cerrar sesión, el código deja de estar en pantalla.
  await camila.getByRole('button', { name: 'CERRAR SESIÓN' }).click()
  await expect(camila.getByLabel('Tu correo')).toBeVisible()
  await expect(camila.getByTestId('codigo')).toHaveCount(0)
})
