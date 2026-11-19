// Token de invitación: 32 bytes aleatorios en base64url. A la base solo
// viaja su SHA-256; el token en claro existe únicamente en la respuesta de
// create-invitation y en el enlace que la persona comparte.

declare const brand: unique symbol
export type InvitationToken = string & { readonly [brand]: 'InvitationToken' }

const TOKEN_BYTES = 32
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export function newInvitationToken(): InvitationToken {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') as InvitationToken
}

export function parseInvitationToken(value: unknown): InvitationToken | null {
  return typeof value === 'string' && TOKEN.test(value) ? (value as InvitationToken) : null
}

export async function hashInvitationToken(token: InvitationToken): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
