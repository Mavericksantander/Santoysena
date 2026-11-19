// Traduce un error de la base a una respuesta HTTP. La respuesta solo lleva
// un código estable: nunca el mensaje ni el detalle que entrega Postgres.

const BUSINESS_ERRORS = {
  not_a_member: 403,
  not_an_admin: 403,
  cannot_change_own_role: 403,
  cannot_change_owner_role: 403,
  cannot_remove_owner: 403,
  invitation_invalid: 404,
  target_not_a_member: 404,
  already_a_member: 409,
  invalid_ttl: 400,
} as const

export type ErrorCode =
  | keyof typeof BUSINESS_ERRORS
  | 'invalid_input'
  | 'method_not_allowed'
  | 'internal_error'

export class AppError extends Error {
  readonly status: number
  readonly code: ErrorCode
  constructor(status: number, code: ErrorCode) {
    super(code)
    this.status = status
    this.code = code
  }
}

export interface DatabaseError {
  code?: string
  message?: string
}

const RAISED_BY_OUR_FUNCTIONS = 'P0001'
const CHECK_VIOLATION = '23514'

export function fromDatabaseError(error: DatabaseError): AppError {
  if (error.code === RAISED_BY_OUR_FUNCTIONS && error.message !== undefined) {
    if (Object.hasOwn(BUSINESS_ERRORS, error.message)) {
      const code = error.message as keyof typeof BUSINESS_ERRORS
      return new AppError(BUSINESS_ERRORS[code], code)
    }
  }
  if (error.code === CHECK_VIOLATION) return new AppError(400, 'invalid_input')
  return new AppError(500, 'internal_error')
}

export const invitationInvalid = () => new AppError(BUSINESS_ERRORS.invitation_invalid, 'invitation_invalid')
