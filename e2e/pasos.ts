import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { codeIn, latestMailTo } from './correo.ts'

const WORD = /^[A-ZÑÁÉÍÓÚÜ]{4,10}$/

export async function signIn(page: Page, name: string): Promise<string> {
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

export async function todaysCode(page: Page): Promise<string[]> {
  const code = page.getByTestId('codigo')
  await expect(code).toBeVisible()
  const words = await code.locator('span').allTextContents()
  expect(words).toHaveLength(2)
  for (const word of words) expect(word).toMatch(WORD)
  return words
}
