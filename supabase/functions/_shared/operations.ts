// Las operaciones del producto. Cada una declara qué entrada acepta y qué
// función de la base ejecuta. La autorización no está aquí: la decide la base.

import { dailyCode } from './daily-code.ts'
import { invitationInvalid } from './errors.ts'
import type { Operation } from './handle.ts'
import {
  type Name,
  parseName,
  parseOptionalTimezone,
  parseRole,
  parseTtlSeconds,
  parseUuid,
  type Role,
  type TtlSeconds,
  type Uuid,
} from './input.ts'
import {
  hashInvitationToken,
  type InvitationToken,
  newInvitationToken,
  parseInvitationToken,
} from './invitation-token.ts'
import { endOfLocalDay, formatWithOffset, localDateAt } from './local-day.ts'

export const createFamily: Operation<{ name: Name; timezone: string | undefined }> = {
  parse: (body) => ({
    name: parseName(body.name, 'name'),
    timezone: parseOptionalTimezone(body.timezone, 'timezone'),
  }),
  run: async (call, actor, { name, timezone }) => ({
    family_id: await call('create_family', {
      p_actor: actor,
      p_name: name,
      ...(timezone === undefined ? {} : { p_timezone: timezone }),
    }),
  }),
}

export const createInvitation: Operation<{ familyId: Uuid; ttlSeconds: TtlSeconds }> = {
  parse: (body) => ({
    familyId: parseUuid(body.family_id, 'family_id'),
    ttlSeconds: parseTtlSeconds(body.ttl_seconds, 'ttl_seconds'),
  }),
  run: async (call, actor, { familyId, ttlSeconds }) => {
    const token = newInvitationToken()
    const expiresAt = await call('create_invitation', {
      p_actor: actor,
      p_family_id: familyId,
      p_token_hash: await hashInvitationToken(token),
      p_ttl_seconds: ttlSeconds,
    })
    return { token, expires_at: expiresAt }
  },
}

// Un token con forma inválida responde igual que uno desconocido.
export const acceptInvitation: Operation<{ token: InvitationToken | null }> = {
  parse: (body) => ({ token: parseInvitationToken(body.token) }),
  run: async (call, actor, { token }) => {
    if (token === null) throw invitationInvalid()
    return {
      family_id: await call('accept_invitation', {
        p_actor: actor,
        p_token_hash: await hashInvitationToken(token),
      }),
    }
  },
}

export const listFamilyMembers: Operation<{ familyId: Uuid }> = {
  parse: (body) => ({ familyId: parseUuid(body.family_id, 'family_id') }),
  run: async (call, actor, { familyId }) => ({
    members: await call('list_family_members', { p_actor: actor, p_family_id: familyId }),
  }),
}

export const removeFamilyMember: Operation<{ familyId: Uuid; target: Uuid }> = {
  parse: (body) => ({
    familyId: parseUuid(body.family_id, 'family_id'),
    target: parseUuid(body.user_id, 'user_id'),
  }),
  run: async (call, actor, { familyId, target }) => {
    await call('remove_family_member', { p_actor: actor, p_family_id: familyId, p_target: target })
    return {}
  },
}

export const setMemberRole: Operation<{ familyId: Uuid; target: Uuid; role: Role }> = {
  parse: (body) => ({
    familyId: parseUuid(body.family_id, 'family_id'),
    target: parseUuid(body.user_id, 'user_id'),
    role: parseRole(body.role, 'role'),
  }),
  run: async (call, actor, { familyId, target, role }) => {
    await call('set_member_role', {
      p_actor: actor,
      p_family_id: familyId,
      p_target: target,
      p_role: role,
    })
    return {}
  },
}

/** Lo único que get-family-code toma del entorno. No hay otra fuente de hora ni de llave. */
export interface CodeDependencies {
  /** Reloj del servidor. La petición no puede influir en la fecha. */
  now(): Date
  serverSecret(): Promise<CryptoKey>
}

function codeContext(rows: unknown): { timezone: string; epoch: number } {
  const row: unknown = Array.isArray(rows) && rows.length === 1 ? rows[0] : null
  if (typeof row === 'object' && row !== null) {
    const { timezone, code_epoch: epoch } = row as Record<string, unknown>
    if (typeof timezone === 'string' && typeof epoch === 'number') return { timezone, epoch }
  }
  throw new Error('unexpected_code_context')
}

// La membresía se comprueba primero, en la base. Solo después se lee la llave.
export const getFamilyCode = (deps: CodeDependencies): Operation<{ familyId: Uuid }> => ({
  parse: (body) => ({ familyId: parseUuid(body.family_id, 'family_id') }),
  run: async (call, actor, { familyId }) => {
    const { timezone, epoch } = codeContext(
      await call('family_code_context', { p_actor: actor, p_family_id: familyId }),
    )
    const now = deps.now()
    const date = localDateAt(now, timezone)
    const [wordOne, wordTwo] = await dailyCode({
      key: await deps.serverSecret(),
      familyId,
      date,
      epoch,
      wordCount: 2,
    })
    return {
      family_id: familyId,
      date,
      timezone,
      word_one: wordOne,
      word_two: wordTwo,
      expires_at: formatWithOffset(endOfLocalDay(now, timezone), timezone),
    }
  },
})
