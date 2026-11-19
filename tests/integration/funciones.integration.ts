import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
  callDataApi,
  callFunction,
  emailCodeFor,
  newPerson,
  sessionFromEmailCode,
} from './supabase.ts'

const FUNCTIONS = [
  'create-family',
  'create-invitation',
  'accept-invitation',
  'list-family-members',
  'remove-family-member',
  'set-member-role',
  'get-family-code',
]

async function familyOf(owner: { token: string }): Promise<string> {
  const created = await callFunction('create-family', { name: 'Familia Pérez' }, owner.token)
  expect(created).toMatchObject({ status: 200 })
  return created.body.family_id as string
}

async function invitationFor(admin: { token: string }, familyId: string): Promise<string> {
  const invitation = await callFunction('create-invitation', { family_id: familyId }, admin.token)
  expect(invitation).toMatchObject({ status: 200 })
  return invitation.body.token as string
}

describe('sin sesión', () => {
  test.each(FUNCTIONS)('%s responde 401 a un anónimo', async (name) => {
    const answer = await callFunction(name, { family_id: randomUUID() })
    expect(answer.status).toBe(401)
  })

  test('una sesión inventada responde 401', async () => {
    const answer = await callFunction('create-family', { name: 'F' }, 'eyJhbGciOiJub25lIn0.e30.')
    expect(answer.status).toBe(401)
  })
})

describe('recorrido completo de una familia', () => {
  test('crear, invitar, aceptar, restringir y expulsar', async () => {
    const [rosa, camila, intruso] = await Promise.all([
      newPerson('Rosa'),
      newPerson('Camila'),
      newPerson('Intruso'),
    ])

    const familyId = await familyOf(rosa)
    expect(familyId).toMatch(/^[0-9a-f-]{36}$/)

    // El perfil lo creó el trigger al registrarse en Supabase Auth.
    const alone = await callFunction('list-family-members', { family_id: familyId }, rosa.token)
    expect(alone.status).toBe(200)
    expect(alone.body.members).toMatchObject([
      { user_id: rosa.id, display_name: 'Rosa', role: 'admin', is_owner: true },
    ])

    const token = await invitationFor(rosa, familyId)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    expect(await callFunction('accept-invitation', { token }, camila.token)).toEqual({
      status: 200,
      body: { family_id: familyId },
    })

    // El token ya se usó: nadie más entra con él.
    expect(await callFunction('accept-invitation', { token }, intruso.token)).toEqual({
      status: 404,
      body: { code: 'invitation_invalid' },
    })

    // Un miembro regular no invita, no expulsa y no se asciende.
    expect(await callFunction('create-invitation', { family_id: familyId }, camila.token)).toEqual({
      status: 403,
      body: { code: 'not_an_admin' },
    })
    expect(
      await callFunction('remove-family-member', { family_id: familyId, user_id: rosa.id }, camila.token),
    ).toEqual({ status: 403, body: { code: 'not_an_admin' } })
    expect(
      await callFunction(
        'set-member-role',
        { family_id: familyId, user_id: camila.id, role: 'admin' },
        camila.token,
      ),
    ).toEqual({ status: 403, body: { code: 'not_an_admin' } })

    // Un extraño no distingue una familia ajena de una que no existe.
    const foreign = await callFunction('list-family-members', { family_id: familyId }, intruso.token)
    const missing = await callFunction('list-family-members', { family_id: randomUUID() }, intruso.token)
    expect(foreign).toEqual({ status: 403, body: { code: 'not_a_member' } })
    expect(missing).toEqual(foreign)

    // Camila ve la familia hasta que la expulsan; después, con la misma sesión, ya no.
    expect(
      (await callFunction('list-family-members', { family_id: familyId }, camila.token)).status,
    ).toBe(200)
    expect(
      await callFunction('remove-family-member', { family_id: familyId, user_id: camila.id }, rosa.token),
    ).toEqual({ status: 200, body: {} })
    expect(await callFunction('list-family-members', { family_id: familyId }, camila.token)).toEqual({
      status: 403,
      body: { code: 'not_a_member' },
    })
  })

  test('una entrada inválida responde 400 con el campo', async () => {
    const rosa = await newPerson('Rosa')
    expect(await callFunction('create-family', { name: '   ' }, rosa.token)).toEqual({
      status: 400,
      body: { code: 'invalid_input', field: 'name' },
    })
    expect(
      await callFunction('create-family', { name: 'F', timezone: 'Marte/Olympus' }, rosa.token),
    ).toEqual({ status: 400, body: { code: 'invalid_input', field: 'timezone' } })
  })
})

describe('invitación de un solo uso bajo concurrencia', () => {
  test('si seis personas aceptan el mismo token a la vez, entra exactamente una', async () => {
    const rosa = await newPerson('Rosa')
    const familyId = await familyOf(rosa)
    const token = await invitationFor(rosa, familyId)
    const guests = await Promise.all(Array.from({ length: 6 }, (_, i) => newPerson(`Invitado ${i}`)))

    const answers = await Promise.all(
      guests.map((guest) => callFunction('accept-invitation', { token }, guest.token)),
    )

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 404, 404, 404, 404, 404])
    const members = await callFunction('list-family-members', { family_id: familyId }, rosa.token)
    expect(members.body.members).toHaveLength(2)
  })
})

describe('la API de datos está cerrada para el cliente', () => {
  test('un usuario con sesión no puede ejecutar las reglas saltándose las Edge Functions', async () => {
    const [rosa, camila] = await Promise.all([newPerson('Rosa'), newPerson('Camila')])
    const familyId = await familyOf(rosa)

    const impersonation = await callDataApi('rpc/create_family', camila.token, {
      method: 'POST',
      profile: 'app',
      body: JSON.stringify({ p_actor: rosa.id, p_name: 'Suplantada' }),
    })
    expect([401, 403]).toContain(impersonation.status)

    const spoofedList = await callDataApi('rpc/list_family_members', camila.token, {
      method: 'POST',
      profile: 'app',
      body: JSON.stringify({ p_actor: rosa.id, p_family_id: familyId }),
    })
    expect([401, 403]).toContain(spoofedList.status)
  })

  test.each(['families', 'family_members', 'family_invitations', 'profiles'])(
    'un usuario con sesión no puede leer la tabla %s',
    async (table) => {
      const camila = await newPerson('Camila')
      const response = await callDataApi(`${table}?select=*`, camila.token)
      expect(response.status).toBeGreaterThanOrEqual(400)
      const forced = await callDataApi(`${table}?select=*`, camila.token, { profile: 'public' })
      expect(forced.status).toBeGreaterThanOrEqual(400)
    },
  )
})

describe('inicio de sesión con código por correo', () => {
  test('el código tiene 6 dígitos, abre una sesión que sirve en las funciones y no se reutiliza', async () => {
    const rosa = await newPerson('Rosa')
    const code = await emailCodeFor(rosa.email)
    expect(code).toMatch(/^\d{6}$/)

    const verified = await sessionFromEmailCode(rosa.email, code)
    expect(verified.status).toBe(200)
    const session = (await verified.json()) as { access_token: string }
    expect((await callFunction('create-family', { name: 'F' }, session.access_token)).status).toBe(200)

    expect((await sessionFromEmailCode(rosa.email, code)).status).toBeGreaterThanOrEqual(400)
  })

  test('un código equivocado no abre sesión', async () => {
    const rosa = await newPerson('Rosa')
    const code = await emailCodeFor(rosa.email)
    const wrong = code === '000000' ? '000001' : '000000'
    expect((await sessionFromEmailCode(rosa.email, wrong)).status).toBeGreaterThanOrEqual(400)
  })
})

describe('código diario', () => {
  test('los miembros ven el mismo código, un extraño ninguno, y expulsar lo cambia al instante', async () => {
    const [rosa, camila, intruso] = await Promise.all([
      newPerson('Rosa'),
      newPerson('Camila'),
      newPerson('Intruso'),
    ])
    const familyId = await familyOf(rosa)
    const token = await invitationFor(rosa, familyId)
    await callFunction('accept-invitation', { token }, camila.token)

    const forRosa = await callFunction('get-family-code', { family_id: familyId }, rosa.token)
    const forCamila = await callFunction('get-family-code', { family_id: familyId }, camila.token)
    expect(forRosa.status).toBe(200)
    expect(forCamila).toEqual(forRosa)
    expect(forRosa.body).toMatchObject({
      family_id: familyId,
      timezone: 'America/Santiago',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      word_one: expect.stringMatching(/^[A-ZÑÁÉÍÓÚÜ]{4,10}$/),
      word_two: expect.stringMatching(/^[A-ZÑÁÉÍÓÚÜ]{4,10}$/),
    })
    const expiresAt = new Date(forRosa.body.expires_at as string).getTime()
    expect(expiresAt).toBeGreaterThan(Date.now())
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(25 * 3_600_000)

    expect(await callFunction('get-family-code', { family_id: familyId }, intruso.token)).toEqual({
      status: 403,
      body: { code: 'not_a_member' },
    })

    await callFunction('remove-family-member', { family_id: familyId, user_id: camila.id }, rosa.token)
    expect(await callFunction('get-family-code', { family_id: familyId }, camila.token)).toEqual({
      status: 403,
      body: { code: 'not_a_member' },
    })
    const afterRemoval = await callFunction('get-family-code', { family_id: familyId }, rosa.token)
    expect(afterRemoval.status).toBe(200)
    expect([afterRemoval.body.word_one, afterRemoval.body.word_two]).not.toEqual([
      forRosa.body.word_one,
      forRosa.body.word_two,
    ])
  })

  test('dos familias distintas tienen códigos distintos el mismo día', async () => {
    const rosa = await newPerson('Rosa')
    const [first, second] = await Promise.all([familyOf(rosa), familyOf(rosa)])
    const a = await callFunction('get-family-code', { family_id: first }, rosa.token)
    const b = await callFunction('get-family-code', { family_id: second }, rosa.token)
    expect([a.status, b.status]).toEqual([200, 200])
    expect([a.body.word_one, a.body.word_two]).not.toEqual([b.body.word_one, b.body.word_two])
  })
})
