import { beforeEach, describe, expect, test } from 'vitest'
import { RequestError } from './source.ts'
import { supabaseBackend } from './supabase.ts'

const URL_BASE = 'http://supabase.test'
const KEY = 'sb_publishable_de_prueba'

interface Sent {
  url: string
  method: string
  headers: Headers
  body: unknown
}

let sent: Sent[]
let answers: Record<string, { status: number; body: unknown }>

/** Servidor falso: responde por ruta y anota cada petición. */
const fakeFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const text = await request.text()
  sent.push({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: text ? JSON.parse(text) : null,
  })
  const path = new URL(request.url).pathname
  const answer = answers[path]
  if (!answer) throw new TypeError('fetch failed')
  return new Response(JSON.stringify(answer.body), {
    status: answer.status,
    headers: { 'content-type': 'application/json' },
  })
}

const backend = () => supabaseBackend(URL_BASE, KEY, fakeFetch)

beforeEach(() => {
  sent = []
  answers = {}
})

describe('fuente de datos real', () => {
  test('pide las familias a la Edge Function con la llave publicable', async () => {
    const families = [{ id: 'f1', name: 'Familia Pérez', role: 'admin' }]
    answers['/functions/v1/list-families'] = { status: 200, body: { families } }
    expect(await backend().source.listFamilies()).toEqual(families)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.method).toBe('POST')
    expect(sent[0]!.url).toBe(`${URL_BASE}/functions/v1/list-families`)
    expect(sent[0]!.headers.get('apikey')).toBe(KEY)
    expect(sent[0]!.body).toEqual({})
  })

  test('traduce el código del día y solo envía el identificador de la familia', async () => {
    answers['/functions/v1/get-family-code'] = {
      status: 200,
      body: {
        family_id: 'f1',
        date: '2026-11-18',
        timezone: 'America/Santiago',
        word_one: 'COPIHUE',
        word_two: 'PLANEADOR',
        expires_at: '2026-11-19T00:00:00-03:00',
      },
    }
    expect(await backend().source.getFamilyCode('f1')).toEqual({
      familyId: 'f1',
      date: '2026-11-18',
      timezone: 'America/Santiago',
      wordOne: 'COPIHUE',
      wordTwo: 'PLANEADOR',
      expiresAt: new Date('2026-11-19T03:00:00Z'),
    })
    expect(sent[0]!.body).toEqual({ family_id: 'f1' })
  })

  test('traduce la lista de miembros', async () => {
    answers['/functions/v1/list-family-members'] = {
      status: 200,
      body: { members: [{ user_id: 'u1', display_name: 'Rosa', role: 'admin', is_owner: true, joined_at: 'x' }] },
    }
    expect(await backend().source.listMembers('f1')).toEqual([
      { userId: 'u1', displayName: 'Rosa', role: 'admin', isOwner: true },
    ])
  })

  test('crear familia, invitar y aceptar llaman a su función con lo justo', async () => {
    answers['/functions/v1/create-family'] = { status: 200, body: { family_id: 'f1' } }
    answers['/functions/v1/create-invitation'] = {
      status: 200,
      body: { token: 'k'.repeat(43), expires_at: '2026-11-20T00:00:00Z' },
    }
    answers['/functions/v1/accept-invitation'] = { status: 200, body: { family_id: 'f1' } }
    const { source } = backend()
    await source.createFamily('Familia Soto')
    expect(await source.createInvitation('f1')).toEqual({
      token: 'k'.repeat(43),
      expiresAt: new Date('2026-11-20T00:00:00Z'),
    })
    await source.acceptInvitation('k'.repeat(43))
    expect(sent.map((request) => [new URL(request.url).pathname, request.body])).toEqual([
      ['/functions/v1/create-family', { name: 'Familia Soto' }],
      ['/functions/v1/create-invitation', { family_id: 'f1' }],
      ['/functions/v1/accept-invitation', { token: 'k'.repeat(43) }],
    ])
  })

  test('sacar a alguien y cambiar su rol llaman a su función con lo justo', async () => {
    answers['/functions/v1/remove-family-member'] = { status: 200, body: {} }
    answers['/functions/v1/set-member-role'] = { status: 200, body: {} }
    const { source } = backend()
    await source.removeMember('f1', 'u2')
    await source.setMemberRole('f1', 'u3', 'admin')
    expect(sent.map((request) => [new URL(request.url).pathname, request.body])).toEqual([
      ['/functions/v1/remove-family-member', { family_id: 'f1', user_id: 'u2' }],
      ['/functions/v1/set-member-role', { family_id: 'f1', user_id: 'u3', role: 'admin' }],
    ])
  })

  test('un rechazo del servidor llega como su código estable', async () => {
    answers['/functions/v1/get-family-code'] = { status: 403, body: { code: 'not_a_member' } }
    await expect(backend().source.getFamilyCode('f1')).rejects.toEqual(new RequestError('not_a_member'))
  })

  test('una respuesta de error sin código no se hace pasar por uno conocido', async () => {
    answers['/functions/v1/get-family-code'] = { status: 500, body: { mensaje: 'algo interno' } }
    await expect(backend().source.getFamilyCode('f1')).rejects.toEqual(
      new RequestError('unexpected_response'),
    )
  })

  test('sin conexión el error es network_error', async () => {
    await expect(backend().source.listFamilies()).rejects.toEqual(new RequestError('network_error'))
  })
})

describe('inicio de sesión real', () => {
  test('pide el código por correo y registra el nombre para una cuenta nueva', async () => {
    answers['/auth/v1/otp'] = { status: 200, body: {} }
    await backend().auth.requestCode('rosa@example.com', 'Abuela Rosa')
    expect(sent[0]!.body).toMatchObject({
      email: 'rosa@example.com',
      create_user: true,
      data: { display_name: 'Abuela Rosa' },
    })
  })

  test('verifica el código como código de correo y deja la sesión abierta', async () => {
    answers['/auth/v1/verify'] = {
      status: 200,
      body: {
        access_token: 'token-de-prueba',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'refresco',
        user: { id: 'u1', aud: 'authenticated', email: 'rosa@example.com' },
      },
    }
    const { auth } = backend()
    await auth.verifyCode('rosa@example.com', '123456')
    expect(sent[0]!.body).toMatchObject({ email: 'rosa@example.com', token: '123456', type: 'email' })
    expect(await auth.current()).toEqual({ userId: 'u1' })
  })

  test('un código rechazado falla y no abre sesión', async () => {
    answers['/auth/v1/verify'] = {
      status: 403,
      body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' },
    }
    const { auth } = backend()
    await expect(auth.verifyCode('rosa@example.com', '000000')).rejects.toBeInstanceOf(RequestError)
    expect(await auth.current()).toBeNull()
  })

  test('sin sesión guardada no hay sesión', async () => {
    expect(await backend().auth.current()).toBeNull()
  })
})
