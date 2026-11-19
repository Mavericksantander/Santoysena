import { describe, expect, test } from 'vitest'
import {
  InvalidInput,
  parseName,
  parseOptionalTimezone,
  parseRole,
  parseTtlSeconds,
  parseUuid,
  readJsonObject,
} from '../../supabase/functions/_shared/input.ts'

const request = (body: string) => new Request('http://local/', { method: 'POST', body })

describe('parseUuid', () => {
  test('acepta un UUID en minúsculas', () => {
    expect(parseUuid('3f2b8c1e-7a4d-4e5f-9b0a-1c2d3e4f5a6b', 'id')).toBe(
      '3f2b8c1e-7a4d-4e5f-9b0a-1c2d3e4f5a6b',
    )
  })

  test.each([
    undefined,
    null,
    42,
    '',
    'no-es-uuid',
    '3F2B8C1E-7A4D-4E5F-9B0A-1C2D3E4F5A6B',
    '3f2b8c1e-7a4d-4e5f-9b0a-1c2d3e4f5a6b; drop table families',
    ' 3f2b8c1e-7a4d-4e5f-9b0a-1c2d3e4f5a6b',
  ])('rechaza %j e indica el campo', (value) => {
    expect(() => parseUuid(value, 'family_id')).toThrow(new InvalidInput('family_id'))
  })
})

describe('parseName', () => {
  test('quita los espacios de los bordes', () => {
    expect(parseName('  Familia Pérez ', 'name')).toBe('Familia Pérez')
  })

  test('acepta exactamente 60 caracteres', () => {
    expect(parseName('x'.repeat(60), 'name')).toHaveLength(60)
  })

  test.each([undefined, 7, '', '    ', 'x'.repeat(61)])('rechaza %j', (value) => {
    expect(() => parseName(value, 'name')).toThrow(InvalidInput)
  })
})

describe('parseTtlSeconds', () => {
  test('sin valor usa un día', () => {
    expect(parseTtlSeconds(undefined, 'ttl_seconds')).toBe(86_400)
  })

  test.each([300, 3600, 604_800])('acepta %d', (value) => {
    expect(parseTtlSeconds(value, 'ttl_seconds')).toBe(value)
  })

  test.each([299, 604_801, 0, -5, 3600.5, Number.NaN, Infinity, '3600', null])(
    'rechaza %j',
    (value) => {
      expect(() => parseTtlSeconds(value, 'ttl_seconds')).toThrow(InvalidInput)
    },
  )
})

describe('parseRole', () => {
  test.each(['admin', 'member'])('acepta %s', (role) => {
    expect(parseRole(role, 'role')).toBe(role)
  })

  test.each(['owner', 'ADMIN', '', undefined, 1])('rechaza %j', (role) => {
    expect(() => parseRole(role, 'role')).toThrow(InvalidInput)
  })
})

describe('parseOptionalTimezone', () => {
  test('ausente queda sin definir, para que la base use su valor por defecto', () => {
    expect(parseOptionalTimezone(undefined, 'timezone')).toBeUndefined()
  })

  test('acepta un texto corto', () => {
    expect(parseOptionalTimezone('Pacific/Easter', 'timezone')).toBe('Pacific/Easter')
  })

  test.each([null, 3, '', 'x'.repeat(65)])('rechaza %j', (value) => {
    expect(() => parseOptionalTimezone(value, 'timezone')).toThrow(InvalidInput)
  })
})

describe('readJsonObject', () => {
  test('lee un objeto JSON', async () => {
    expect(await readJsonObject(request('{"name":"F"}'))).toEqual({ name: 'F' })
  })

  test.each(['', 'no es json', '[1,2]', '"texto"', 'null', '7'])(
    'rechaza el cuerpo %j',
    async (body) => {
      await expect(readJsonObject(request(body))).rejects.toThrow(new InvalidInput('body'))
    },
  )
})
