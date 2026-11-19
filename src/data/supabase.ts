// Conexión real: Supabase Auth para la sesión y las Edge Functions para todo
// lo demás. El cliente nunca consulta tablas.

import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import type { Auth, Session } from '../auth/auth.ts'
import { type DataSource, RequestError, type Role } from './source.ts'

type Fetch = typeof fetch

export function supabaseBackend(
  url: string,
  publishableKey: string,
  fetchImpl?: Fetch,
): { auth: Auth; source: DataSource } {
  const client = createClient(url, publishableKey, fetchImpl ? { global: { fetch: fetchImpl } } : {})

  async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.functions.invoke<T>(name, { body })
    if (!error) return data as T
    let code = 'network_error'
    if (error instanceof FunctionsHttpError) {
      const answer = (await (error.context as Response).json().catch(() => ({}))) as { code?: unknown }
      code = typeof answer.code === 'string' ? answer.code : 'unexpected_response'
    }
    throw new RequestError(code)
  }

  const toSession = (session: { user: { id: string } } | null): Session | null =>
    session ? { userId: session.user.id } : null

  const auth: Auth = {
    current: async () => toSession((await client.auth.getSession()).data.session),
    subscribe: (listener) => {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)))
      return () => data.subscription.unsubscribe()
    },
    requestCode: async (email, displayName) => {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, data: { display_name: displayName } },
      })
      if (error) throw new RequestError(error.code ?? 'auth_error')
    },
    verifyCode: async (email, code) => {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) throw new RequestError(error.code ?? 'auth_error')
    },
    signOut: async () => {
      await client.auth.signOut()
    },
  }

  const source: DataSource = {
    isDemo: false,
    listFamilies: async () =>
      (await call<{ families: { id: string; name: string; role: Role }[] }>('list-families', {})).families,
    getFamilyCode: async (familyId) => {
      const code = await call<{
        family_id: string
        date: string
        timezone: string
        word_one: string
        word_two: string
        expires_at: string
      }>('get-family-code', { family_id: familyId })
      return {
        familyId: code.family_id,
        date: code.date,
        timezone: code.timezone,
        wordOne: code.word_one,
        wordTwo: code.word_two,
        expiresAt: new Date(code.expires_at),
      }
    },
    listMembers: async (familyId) => {
      const { members } = await call<{
        members: { user_id: string; display_name: string; role: Role; is_owner: boolean }[]
      }>('list-family-members', { family_id: familyId })
      return members.map((member) => ({
        userId: member.user_id,
        displayName: member.display_name,
        role: member.role,
        isOwner: member.is_owner,
      }))
    },
    createFamily: async (name) => {
      await call('create-family', { name })
    },
    createInvitation: async (familyId) => {
      const invitation = await call<{ token: string; expires_at: string }>('create-invitation', {
        family_id: familyId,
      })
      return { token: invitation.token, expiresAt: new Date(invitation.expires_at) }
    },
    acceptInvitation: async (token) => {
      await call('accept-invitation', { token })
    },
  }

  return { auth, source }
}
