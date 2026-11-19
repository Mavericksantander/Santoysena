import { describe, expect, test } from 'vitest'
import { fromDatabaseError } from '../../supabase/functions/_shared/errors.ts'

describe('fromDatabaseError', () => {
  test.each([
    ['not_a_member', 403],
    ['not_an_admin', 403],
    ['cannot_change_own_role', 403],
    ['cannot_change_owner_role', 403],
    ['cannot_remove_owner', 403],
    ['invitation_invalid', 404],
    ['target_not_a_member', 404],
    ['already_a_member', 409],
    ['invalid_ttl', 400],
  ] as const)('%s responde %d', (message, status) => {
    const error = fromDatabaseError({ code: 'P0001', message })
    expect({ status: error.status, code: error.code }).toEqual({ status, code: message })
  })

  test('una violación de constraint es entrada inválida, sin nombrar el constraint', () => {
    const error = fromDatabaseError({
      code: '23514',
      message: 'new row violates check constraint "families_timezone_valid"',
    })
    expect({ status: error.status, code: error.code }).toEqual({ status: 400, code: 'invalid_input' })
  })

  test.each([
    { code: 'P0001', message: 'owner_must_be_admin' },
    { code: 'P0001', message: 'toString' },
    { code: 'P0001' },
    { code: '42501', message: 'not_a_member' },
    { code: '23503', message: 'insert or update violates foreign key constraint' },
    { message: 'connection refused' },
    {},
  ])('%j es un error interno sin detalle', (dbError) => {
    const error = fromDatabaseError(dbError)
    expect({ status: error.status, code: error.code }).toEqual({ status: 500, code: 'internal_error' })
  })
})
