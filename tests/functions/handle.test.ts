import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { dailyCode, importServerSecret } from '../../supabase/functions/_shared/daily-code.ts'
import type { DatabaseError } from '../../supabase/functions/_shared/errors.ts'
import { handle, type Operation, type Rpc } from '../../supabase/functions/_shared/handle.ts'
import {
  acceptInvitation,
  createFamily,
  createInvitation,
  getFamilyCode,
  listFamilies,
  listFamilyMembers,
  removeFamilyMember,
  setMemberRole,
} from '../../supabase/functions/_shared/operations.ts'
import { parseUuid } from '../../supabase/functions/_shared/input.ts'
import { parseLocalDate } from '../../supabase/functions/_shared/local-day.ts'
import { WORDLIST_ES_V1 } from '../../supabase/functions/_shared/wordlist-es-v1.ts'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const FAMILY = '22222222-2222-4222-8222-222222222222'
const TARGET = '33333333-3333-4333-8333-333333333333'

const post = (body: unknown) =>
  new Request('http://local/', { method: 'POST', body: JSON.stringify(body) })

/** Base falsa que anota cada llamada y responde lo que se le indique. */
function fakeRpc(result: { data?: unknown; error?: DatabaseError } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const rpc: Rpc = (fn, args) => {
    calls.push({ fn, args })
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  }
  return { rpc, calls }
}

async function run<I>(operation: Operation<I>, body: unknown, db = fakeRpc(), actor: unknown = ACTOR) {
  const response = await handle(operation, post(body), actor, db.rpc)
  const answer = (await response.json()) as Record<string, unknown>
  return { status: response.status, body: answer, calls: db.calls, response }
}

const logs = ['log', 'info', 'warn', 'error', 'debug'] as const
beforeEach(() => {
  for (const level of logs) vi.spyOn(console, level).mockImplementation(() => {})
})
afterEach(() => {
  for (const level of logs) expect(console[level]).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('handle', () => {
  test.each(['GET', 'PUT', 'DELETE'])('%s se rechaza sin tocar la base', async (method) => {
    const db = fakeRpc()
    const response = await handle(listFamilyMembers, new Request('http://local/', { method }), ACTOR, db.rpc)
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ code: 'method_not_allowed' })
    expect(db.calls).toEqual([])
  })

  test('un cuerpo que no es JSON se rechaza sin tocar la base', async () => {
    const db = fakeRpc()
    const request = new Request('http://local/', { method: 'POST', body: '{' })
    const response = await handle(createFamily, request, ACTOR, db.rpc)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ code: 'invalid_input', field: 'body' })
    expect(db.calls).toEqual([])
  })

  test('sin un actor válido no se ejecuta nada', async () => {
    const { status, calls } = await run(createFamily, { name: 'F' }, fakeRpc(), null)
    expect(status).toBe(400)
    expect(calls).toEqual([])
  })

  test('las respuestas no se pueden guardar en caché', async () => {
    const { response } = await run(listFamilyMembers, { family_id: FAMILY }, fakeRpc({ data: [] }))
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('un error de negocio de la base responde solo su código', async () => {
    const db = fakeRpc({ error: { code: 'P0001', message: 'not_a_member' } })
    const { status, body } = await run(listFamilyMembers, { family_id: FAMILY }, db)
    expect(status).toBe(403)
    expect(body).toEqual({ code: 'not_a_member' })
  })

  test('un error inesperado de la base no filtra su mensaje', async () => {
    const db = fakeRpc({
      error: { code: 'XX000', message: 'detalle interno: clave sb_secret_abc en 10.0.0.5' },
    })
    const { status, body } = await run(listFamilyMembers, { family_id: FAMILY }, db)
    expect(status).toBe(500)
    expect(body).toEqual({ code: 'internal_error' })
  })

  test('si la base no responde, el error tampoco filtra nada', async () => {
    const rpc: Rpc = () => Promise.reject(new Error('fetch failed: http://kong:8000 token=abc'))
    const response = await handle(listFamilyMembers, post({ family_id: FAMILY }), ACTOR, rpc)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ code: 'internal_error' })
  })
})

describe('create-family', () => {
  test('crea la familia a nombre del actor de la sesión, no de uno enviado en el cuerpo', async () => {
    const { status, body, calls } = await run(
      createFamily,
      { name: '  Familia Pérez ', p_actor: TARGET, actor: TARGET },
      fakeRpc({ data: FAMILY }),
    )
    expect(status).toBe(200)
    expect(body).toEqual({ family_id: FAMILY })
    expect(calls).toEqual([{ fn: 'create_family', args: { p_actor: ACTOR, p_name: 'Familia Pérez' } }])
  })

  test('pasa la zona horaria cuando viene', async () => {
    const { calls } = await run(createFamily, { name: 'F', timezone: 'Pacific/Easter' })
    expect(calls[0]!.args).toEqual({ p_actor: ACTOR, p_name: 'F', p_timezone: 'Pacific/Easter' })
  })

  test('sin nombre responde 400 indicando el campo', async () => {
    const { status, body, calls } = await run(createFamily, {})
    expect(status).toBe(400)
    expect(body).toEqual({ code: 'invalid_input', field: 'name' })
    expect(calls).toEqual([])
  })
})

describe('create-invitation', () => {
  test('entrega el token en claro y a la base solo le llega su hash', async () => {
    const { status, body, calls } = await run(
      createInvitation,
      { family_id: FAMILY },
      fakeRpc({ data: '2026-11-20T00:00:00+00:00' }),
    )
    const token = body.token as string
    expect(status).toBe(200)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.expires_at).toBe('2026-11-20T00:00:00+00:00')
    expect(calls).toEqual([
      {
        fn: 'create_invitation',
        args: {
          p_actor: ACTOR,
          p_family_id: FAMILY,
          p_token_hash: createHash('sha256').update(token).digest('hex'),
          p_ttl_seconds: 86_400,
        },
      },
    ])
    expect(JSON.stringify(calls)).not.toContain(token)
  })

  test('respeta el plazo pedido', async () => {
    const { calls } = await run(createInvitation, { family_id: FAMILY, ttl_seconds: 600 })
    expect(calls[0]!.args.p_ttl_seconds).toBe(600)
  })

  test('un plazo fuera de rango no llega a la base', async () => {
    const { status, body, calls } = await run(createInvitation, { family_id: FAMILY, ttl_seconds: 10 })
    expect(status).toBe(400)
    expect(body).toEqual({ code: 'invalid_input', field: 'ttl_seconds' })
    expect(calls).toEqual([])
  })
})

describe('accept-invitation', () => {
  const token = 'k'.repeat(43)

  test('busca la invitación por el hash del token', async () => {
    const { status, body, calls } = await run(acceptInvitation, { token }, fakeRpc({ data: FAMILY }))
    expect(status).toBe(200)
    expect(body).toEqual({ family_id: FAMILY })
    expect(calls).toEqual([
      {
        fn: 'accept_invitation',
        args: { p_actor: ACTOR, p_token_hash: createHash('sha256').update(token).digest('hex') },
      },
    ])
  })

  test.each([undefined, '', 'corto', 'k'.repeat(44), 42])(
    'un token con mala forma (%j) responde igual que uno desconocido y no toca la base',
    async (bad) => {
      const { status, body, calls } = await run(acceptInvitation, { token: bad })
      expect(status).toBe(404)
      expect(body).toEqual({ code: 'invitation_invalid' })
      expect(calls).toEqual([])
    },
  )
})

describe('list-family-members', () => {
  test('entrega lo que devuelve la base para el actor de la sesión', async () => {
    const members = [{ user_id: ACTOR, display_name: 'Rosa', role: 'admin', is_owner: true }]
    const { body, calls } = await run(listFamilyMembers, { family_id: FAMILY }, fakeRpc({ data: members }))
    expect(body).toEqual({ members })
    expect(calls).toEqual([{ fn: 'list_family_members', args: { p_actor: ACTOR, p_family_id: FAMILY } }])
  })
})

describe('list-families', () => {
  test('pide las familias del actor de la sesión, sin importar lo que venga en el cuerpo', async () => {
    const families = [{ id: FAMILY, name: 'Familia Pérez', role: 'admin' }]
    const { status, body, calls } = await run(listFamilies, { p_actor: TARGET, user_id: TARGET }, fakeRpc({ data: families }))
    expect(status).toBe(200)
    expect(body).toEqual({ families })
    expect(calls).toEqual([{ fn: 'list_families', args: { p_actor: ACTOR } }])
  })
})

describe('remove-family-member', () => {
  test('pide sacar al objetivo a nombre del actor de la sesión', async () => {
    const { status, body, calls } = await run(removeFamilyMember, { family_id: FAMILY, user_id: TARGET })
    expect(status).toBe(200)
    expect(body).toEqual({})
    expect(calls).toEqual([
      { fn: 'remove_family_member', args: { p_actor: ACTOR, p_family_id: FAMILY, p_target: TARGET } },
    ])
  })

  test('sin objetivo responde 400', async () => {
    const { body, calls } = await run(removeFamilyMember, { family_id: FAMILY })
    expect(body).toEqual({ code: 'invalid_input', field: 'user_id' })
    expect(calls).toEqual([])
  })
})

describe('set-member-role', () => {
  test('pide el cambio de rol a nombre del actor de la sesión', async () => {
    const { calls } = await run(setMemberRole, { family_id: FAMILY, user_id: TARGET, role: 'member' })
    expect(calls).toEqual([
      {
        fn: 'set_member_role',
        args: { p_actor: ACTOR, p_family_id: FAMILY, p_target: TARGET, p_role: 'member' },
      },
    ])
  })

  test('un rol inexistente no llega a la base', async () => {
    const { status, body, calls } = await run(setMemberRole, {
      family_id: FAMILY,
      user_id: TARGET,
      role: 'owner',
    })
    expect(status).toBe(400)
    expect(body).toEqual({ code: 'invalid_input', field: 'role' })
    expect(calls).toEqual([])
  })
})

describe('get-family-code', () => {
  const SECRET = Buffer.alloc(32, 7).toString('base64')
  const NOON = new Date('2026-11-18T15:00:00Z')
  const santiago = (epoch = 0) => fakeRpc({ data: [{ timezone: 'America/Santiago', code_epoch: epoch }] })

  function operation(now: Date = NOON, secret: string | undefined = SECRET) {
    const serverSecret = vi.fn(() => importServerSecret(secret))
    return { op: getFamilyCode({ now: () => now, serverSecret }), serverSecret }
  }

  test('entrega el código de hoy con la forma acordada', async () => {
    const { status, body, calls } = await run(operation().op, { family_id: FAMILY }, santiago())
    const expected = await dailyCode({
      key: await importServerSecret(SECRET),
      familyId: parseUuid(FAMILY, 'family'),
      date: parseLocalDate('2026-11-18'),
      epoch: 0,
      wordCount: 2,
    })
    expect(status).toBe(200)
    expect(body).toEqual({
      family_id: FAMILY,
      date: '2026-11-18',
      timezone: 'America/Santiago',
      word_one: expected[0],
      word_two: expected[1],
      expires_at: '2026-11-19T00:00:00-03:00',
    })
    expect(WORDLIST_ES_V1).toContain(body.word_one)
    expect(calls).toEqual([{ fn: 'family_code_context', args: { p_actor: ACTOR, p_family_id: FAMILY } }])
  })

  test('todos los miembros de la familia ven el mismo código', async () => {
    const forRosa = await run(operation().op, { family_id: FAMILY }, santiago(), ACTOR)
    const forCamila = await run(operation().op, { family_id: FAMILY }, santiago(), TARGET)
    expect(forCamila.body).toEqual(forRosa.body)
    expect(forCamila.calls[0]!.args.p_actor).toBe(TARGET)
  })

  test('el reloj y la fecha que mande el cliente no cambian nada', async () => {
    const honest = await run(operation().op, { family_id: FAMILY }, santiago())
    const db = santiago()
    const request = new Request('http://local/', {
      method: 'POST',
      headers: { date: 'Tue, 01 Jan 2030 00:00:00 GMT', 'x-client-time': '2030-01-01T00:00:00Z' },
      body: JSON.stringify({
        family_id: FAMILY,
        date: '2030-01-01',
        now: '2030-01-01T00:00:00Z',
        timezone: 'Asia/Tokyo',
        epoch: 99,
        code_epoch: 99,
      }),
    })
    const response = await handle(operation().op, request, ACTOR, db.rpc)
    expect(await response.json()).toEqual(honest.body)
  })

  test('durante todo el día local el código es el mismo', async () => {
    const start = await run(operation(new Date('2026-11-18T03:00:00.000Z')).op, { family_id: FAMILY }, santiago())
    const end = await run(operation(new Date('2026-11-19T02:59:59.999Z')).op, { family_id: FAMILY }, santiago())
    expect(end.body).toEqual(start.body)
  })

  test('a la medianoche de la familia el código cambia y el anterior deja de entregarse', async () => {
    const before = await run(operation(new Date('2026-11-19T02:59:59.999Z')).op, { family_id: FAMILY }, santiago())
    const after = await run(operation(new Date('2026-11-19T03:00:00.000Z')).op, { family_id: FAMILY }, santiago())
    expect(before.body.date).toBe('2026-11-18')
    expect(after.body.date).toBe('2026-11-19')
    expect(after.body.expires_at).toBe('2026-11-20T00:00:00-03:00')
    expect([after.body.word_one, after.body.word_two]).not.toEqual([before.body.word_one, before.body.word_two])
  })

  test('la fecha es la de la zona de la familia, no la del servidor ni la de quien mira', async () => {
    const tokyo = fakeRpc({ data: [{ timezone: 'Asia/Tokyo', code_epoch: 0 }] })
    const { body } = await run(operation(new Date('2026-11-18T16:00:00Z')).op, { family_id: FAMILY }, tokyo)
    expect(body).toMatchObject({ date: '2026-11-19', timezone: 'Asia/Tokyo', expires_at: '2026-11-20T00:00:00+09:00' })
  })

  test('el día en que parte el horario de verano, el vencimiento es a la 01:00', async () => {
    const { body } = await run(operation(new Date('2027-09-04T15:00:00Z')).op, { family_id: FAMILY }, santiago())
    expect(body).toMatchObject({ date: '2027-09-04', expires_at: '2027-09-05T01:00:00-03:00' })
  })

  test('cuando sube code_epoch, el código de hoy es otro', async () => {
    const before = await run(operation().op, { family_id: FAMILY }, santiago(0))
    const after = await run(operation().op, { family_id: FAMILY }, santiago(1))
    expect(after.body.date).toBe(before.body.date)
    expect([after.body.word_one, after.body.word_two]).not.toEqual([before.body.word_one, before.body.word_two])
  })

  test('quien no es miembro no recibe palabras, y la llave ni siquiera se lee', async () => {
    const { op, serverSecret } = operation()
    const denied = fakeRpc({ error: { code: 'P0001', message: 'not_a_member' } })
    const { status, body } = await run(op, { family_id: FAMILY }, denied)
    expect(status).toBe(403)
    expect(body).toEqual({ code: 'not_a_member' })
    expect(serverSecret).not.toHaveBeenCalled()
  })

  test.each(['', 'no-es-base64!', Buffer.alloc(16, 1).toString('base64')])(
    'sin una llave válida en el servidor (%j) responde error interno y ninguna palabra',
    async (secret) => {
      const { status, body } = await run(operation(NOON, secret).op, { family_id: FAMILY }, santiago())
      expect(status).toBe(500)
      expect(body).toEqual({ code: 'internal_error' })
    },
  )

  test.each([
    [[]],
    [null],
    [[{ timezone: 'America/Santiago' }]],
    [[{ timezone: 7, code_epoch: 0 }]],
    [[{ timezone: 'America/Santiago', code_epoch: 0 }, { timezone: 'Asia/Tokyo', code_epoch: 5 }]],
  ])(
    'si la base responde algo inesperado (%j) no se genera ningún código',
    async (data) => {
      const { op, serverSecret } = operation()
      const { status, body } = await run(op, { family_id: FAMILY }, fakeRpc({ data }))
      expect(status).toBe(500)
      expect(body).toEqual({ code: 'internal_error' })
      expect(serverSecret).not.toHaveBeenCalled()
    },
  )

  test('sin family_id válido no se consulta la base', async () => {
    const { status, calls } = await run(operation().op, { family_id: 'x' }, santiago())
    expect(status).toBe(400)
    expect(calls).toEqual([])
  })
})
