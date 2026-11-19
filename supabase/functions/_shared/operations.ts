// Las operaciones del producto. Cada una declara qué entrada acepta y qué
// función de la base ejecuta. La autorización no está aquí: la decide la base.

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
