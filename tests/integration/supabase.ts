import { randomUUID } from 'node:crypto'

function required(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  throw new Error(
    `Falta la variable ${names.join(' o ')}. Estos tests necesitan un Supabase local: ` +
      'corre `supabase start` y carga la salida de `supabase status -o env`.',
  )
}

export const apiUrl = required('API_URL')
const secretKey = required('SECRET_KEY', 'SERVICE_ROLE_KEY')
export const publishableKey = required('PUBLISHABLE_KEY', 'ANON_KEY')

const json = { 'content-type': 'application/json' }
const asAdmin = { ...json, apikey: secretKey, authorization: `Bearer ${secretKey}` }

export interface Person {
  id: string
  email: string
  token: string
}

async function expectOk(response: Response, what: string): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`${what} respondió ${response.status}: ${await response.text()}`)
  return (await response.json()) as Record<string, unknown>
}

/** Crea una persona en Supabase Auth y le abre una sesión. */
export async function newPerson(displayName: string): Promise<Person> {
  const email = `${randomUUID()}@example.com`
  const password = randomUUID()
  const user = await expectOk(
    await fetch(`${apiUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: asAdmin,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      }),
    }),
    'crear usuario',
  )
  const session = await expectOk(
    await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { ...json, apikey: publishableKey },
      body: JSON.stringify({ email, password }),
    }),
    'abrir sesión',
  )
  return { id: user.id as string, email, token: session.access_token as string }
}

/** Pide un código de un solo uso para el correo, como lo haría el envío por correo. */
export async function emailCodeFor(email: string): Promise<string> {
  const link = await expectOk(
    await fetch(`${apiUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: asAdmin,
      body: JSON.stringify({ type: 'magiclink', email }),
    }),
    'generar código',
  )
  return link.email_otp as string
}

export async function sessionFromEmailCode(email: string, code: string): Promise<Response> {
  return fetch(`${apiUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { ...json, apikey: publishableKey },
    body: JSON.stringify({ type: 'email', email, token: code }),
  })
}

export interface Answer {
  status: number
  body: Record<string, unknown>
}

/** Llama a una Edge Function. Sin `token` va solo con la llave publicable, como un anónimo. */
export async function callFunction(name: string, body: unknown, token?: string): Promise<Answer> {
  const response = await fetch(`${apiUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { ...json, apikey: publishableKey, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    parsed = { raw: text }
  }
  return { status: response.status, body: parsed }
}

/** Llama a la API de datos directo, saltándose las Edge Functions, como lo intentaría un atacante. */
export function callDataApi(path: string, token: string, init: RequestInit & { profile?: string } = {}) {
  const profile = init.profile ? { 'accept-profile': init.profile, 'content-profile': init.profile } : {}
  return fetch(`${apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...json, apikey: publishableKey, authorization: `Bearer ${token}`, ...profile },
  })
}
