// Validación de entradas. Cada parser devuelve un tipo que solo se puede
// obtener pasando por él, así un valor sin validar no llega a la base.

export class InvalidInput extends Error {
  readonly field: string
  constructor(field: string) {
    super(`invalid_input:${field}`)
    this.field = field
  }
}

declare const brand: unique symbol
export type Uuid = string & { readonly [brand]: 'Uuid' }
export type Name = string & { readonly [brand]: 'Name' }
export type TtlSeconds = number & { readonly [brand]: 'TtlSeconds' }
export type Role = 'admin' | 'member'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const MIN_TTL_SECONDS = 300
export const MAX_TTL_SECONDS = 604_800
export const DEFAULT_TTL_SECONDS = 86_400

export function parseUuid(value: unknown, field: string): Uuid {
  if (typeof value !== 'string' || !UUID.test(value)) throw new InvalidInput(field)
  return value as Uuid
}

export function parseName(value: unknown, field: string): Name {
  if (typeof value !== 'string') throw new InvalidInput(field)
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 60) throw new InvalidInput(field)
  return trimmed as Name
}

/** La base decide si la zona existe; aquí solo se acota la forma. */
export function parseOptionalTimezone(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length < 1 || value.length > 64) {
    throw new InvalidInput(field)
  }
  return value
}

export function parseRole(value: unknown, field: string): Role {
  if (value !== 'admin' && value !== 'member') throw new InvalidInput(field)
  return value
}

export function parseTtlSeconds(value: unknown, field: string): TtlSeconds {
  if (value === undefined) return DEFAULT_TTL_SECONDS as TtlSeconds
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_TTL_SECONDS ||
    value > MAX_TTL_SECONDS
  ) {
    throw new InvalidInput(field)
  }
  return value as TtlSeconds
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new InvalidInput('body')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new InvalidInput('body')
  }
  return body as Record<string, unknown>
}
