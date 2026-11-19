import { createHash } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  hashInvitationToken,
  newInvitationToken,
  parseInvitationToken,
} from '../../supabase/functions/_shared/invitation-token.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('newInvitationToken', () => {
  test('son 32 bytes en base64url sin relleno', () => {
    const token = newInvitationToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  })

  test('sale del generador criptográfico y no de Math.random', () => {
    const secure = vi.spyOn(crypto, 'getRandomValues')
    const insecure = vi.spyOn(Math, 'random')
    newInvitationToken()
    expect(secure).toHaveBeenCalledOnce()
    expect(secure.mock.calls[0]![0]).toHaveLength(32)
    expect(insecure).not.toHaveBeenCalled()
  })

  test('el token es exactamente los bytes que entregó el generador', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      new Uint8Array(array!.buffer).fill(0xfb)
      return array
    })
    expect(newInvitationToken()).toBe(Buffer.alloc(32, 0xfb).toString('base64url'))
  })

  test('mil tokens seguidos son todos distintos', () => {
    const tokens = new Set(Array.from({ length: 1000 }, newInvitationToken))
    expect(tokens.size).toBe(1000)
  })

  test('todo token nuevo pasa su propio parser', () => {
    const token = newInvitationToken()
    expect(parseInvitationToken(token)).toBe(token)
  })
})

describe('parseInvitationToken', () => {
  test.each([
    undefined,
    null,
    12,
    '',
    'a'.repeat(42),
    'a'.repeat(44),
    'a'.repeat(42) + '+',
    'a'.repeat(42) + '/',
    'a'.repeat(42) + '=',
    'a'.repeat(43) + '\n',
  ])('rechaza %j', (value) => {
    expect(parseInvitationToken(value)).toBeNull()
  })
})

describe('hashInvitationToken', () => {
  test('es el SHA-256 en hexadecimal que exige la base', async () => {
    const token = parseInvitationToken('A'.repeat(43))!
    const hash = await hashInvitationToken(token)
    expect(hash).toBe(createHash('sha256').update('A'.repeat(43)).digest('hex'))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
