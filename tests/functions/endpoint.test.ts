// Prueba las Edge Functions reales, de punta a punta, sin Supabase: una
// llave propia firma las sesiones y un servidor local hace de API de datos.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import acceptInvitation from '../../supabase/functions/accept-invitation/index.ts'
import createFamily from '../../supabase/functions/create-family/index.ts'
import listFamilies from '../../supabase/functions/list-families/index.ts'
import getFamilyCode from '../../supabase/functions/get-family-code/index.ts'
import createInvitation from '../../supabase/functions/create-invitation/index.ts'
import listFamilyMembers from '../../supabase/functions/list-family-members/index.ts'
import removeFamilyMember from '../../supabase/functions/remove-family-member/index.ts'
import setMemberRole from '../../supabase/functions/set-member-role/index.ts'

const FUNCTIONS = {
  'create-family': createFamily,
  'create-invitation': createInvitation,
  'accept-invitation': acceptInvitation,
  'list-family-members': listFamilyMembers,
  'remove-family-member': removeFamilyMember,
  'set-member-role': setMemberRole,
  'get-family-code': getFamilyCode,
  'list-families': listFamilies,
}

const USER = '11111111-1111-4111-8111-111111111111'
const FAMILY = '22222222-2222-4222-8222-222222222222'
const SECRET_KEY = 'sb_secret_solo_para_este_test'

interface Received {
  method: string | undefined
  url: string | undefined
  headers: Record<string, string | string[] | undefined>
  body: unknown
}

let dataApi: Server
let received: Received[]
let signingKey: CryptoKey
let strangerKey: CryptoKey

const base64url = (data: ArrayBuffer | string) => Buffer.from(data as string).toString('base64url')

async function sessionToken(key: CryptoKey, claims: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'test-key' }))
  const payload = base64url(
    JSON.stringify({
      sub: USER,
      role: 'authenticated',
      aud: 'authenticated',
      iss: `${process.env.SUPABASE_URL}/auth/v1`,
      iat: now,
      exp: now + 600,
      ...claims,
    }),
  )
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${base64url(signature)}`
}

const call = (fn: keyof typeof FUNCTIONS, body: unknown, token?: string) =>
  FUNCTIONS[fn].fetch(
    new Request(`http://local/functions/v1/${fn}`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
  )

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  signingKey = pair.privateKey
  strangerKey = (
    await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  ).privateKey
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)

  dataApi = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      received.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: raw ? JSON.parse(raw) : null,
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      const isCodeContext = request.url === '/rest/v1/rpc/family_code_context'
      response.end(
        JSON.stringify(isCodeContext ? [{ timezone: 'America/Santiago', code_epoch: 0 }] : FAMILY),
      )
    })
  })
  await new Promise<void>((resolve) => dataApi.listen(0, '127.0.0.1', resolve))

  process.env.SUPABASE_URL = `http://127.0.0.1:${(dataApi.address() as AddressInfo).port}`
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_solo_para_este_test'
  process.env.SUPABASE_SECRET_KEY = SECRET_KEY
  process.env.SERVER_SECRET = Buffer.alloc(32, 9).toString('base64')
  process.env.SUPABASE_JWKS = JSON.stringify({
    keys: [{ ...jwk, kid: 'test-key', alg: 'ES256', use: 'sig' }],
  })
})

afterAll(async () => {
  await new Promise((resolve) => dataApi.close(resolve))
})

beforeEach(() => {
  received = []
})

describe('sin una sesión válida ninguna función toca la base', () => {
  const functionNames = Object.keys(FUNCTIONS) as (keyof typeof FUNCTIONS)[]

  test.each(functionNames)('%s sin credenciales responde 401', async (fn) => {
    const response = await call(fn, { family_id: FAMILY })
    expect(response.status).toBe(401)
    expect(received).toEqual([])
  })

  test.each(functionNames)('%s con una sesión firmada por otra llave responde 401', async (fn) => {
    const response = await call(fn, { family_id: FAMILY }, await sessionToken(strangerKey))
    expect(response.status).toBe(401)
    expect(received).toEqual([])
  })

  test('una sesión vencida responde 401', async () => {
    const expired = await sessionToken(signingKey, { exp: Math.floor(Date.now() / 1000) - 60 })
    const response = await call('create-family', { name: 'F' }, expired)
    expect(response.status).toBe(401)
    expect(received).toEqual([])
  })

  test('una sesión con el contenido alterado responde 401', async () => {
    const [header, , signature] = (await sessionToken(signingKey)).split('.')
    const forged = base64url(
      JSON.stringify({
        sub: '99999999-9999-4999-8999-999999999999',
        role: 'authenticated',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    )
    const response = await call('create-family', { name: 'F' }, `${header}.${forged}.${signature}`)
    expect(response.status).toBe(401)
    expect(received).toEqual([])
  })

  test('la llave publicable sola, sin sesión de usuario, no alcanza', async () => {
    const response = await FUNCTIONS['create-family'].fetch(
      new Request('http://local/functions/v1/create-family', {
        method: 'POST',
        headers: { apikey: 'sb_publishable_solo_para_este_test' },
        body: JSON.stringify({ name: 'F' }),
      }),
    )
    expect(response.status).toBe(401)
    expect(received).toEqual([])
  })
})

describe('con una sesión válida', () => {
  test('llama a la función del esquema app con el usuario de la sesión como actor', async () => {
    const response = await call('create-family', { name: 'Familia Pérez' }, await sessionToken(signingKey))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ family_id: FAMILY })

    expect(received).toHaveLength(1)
    const request = received[0]!
    expect(request.method).toBe('POST')
    expect(request.url).toBe('/rest/v1/rpc/create_family')
    expect(request.headers['content-profile']).toBe('app')
    expect(request.headers.apikey).toBe(SECRET_KEY)
    expect(request.body).toEqual({ p_actor: USER, p_name: 'Familia Pérez' })
  })

  test('una entrada inválida responde 400 sin tocar la base', async () => {
    const response = await call('list-family-members', { family_id: 'x' }, await sessionToken(signingKey))
    expect(response.status).toBe(400)
    expect(received).toEqual([])
  })
})

describe('get-family-code con una sesión válida', () => {
  test('pide el contexto a nombre del usuario de la sesión y entrega dos palabras', async () => {
    const response = await call('get-family-code', { family_id: FAMILY }, await sessionToken(signingKey))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, string>
    expect(body.word_one).toMatch(/^[A-ZÑÁÉÍÓÚÜ]{4,10}$/)
    expect(body.word_two).toMatch(/^[A-ZÑÁÉÍÓÚÜ]{4,10}$/)
    expect(body.timezone).toBe('America/Santiago')
    expect(received.map((request) => [request.url, request.body])).toEqual([
      ['/rest/v1/rpc/family_code_context', { p_actor: USER, p_family_id: FAMILY }],
    ])
  })

  test('si al servidor le falta SERVER_SECRET responde error interno, sin palabras', async () => {
    const saved = process.env.SERVER_SECRET
    delete process.env.SERVER_SECRET
    try {
      const response = await call('get-family-code', { family_id: FAMILY }, await sessionToken(signingKey))
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ code: 'internal_error' })
    } finally {
      process.env.SERVER_SECRET = saved
    }
  })
})
