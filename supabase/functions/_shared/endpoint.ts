// Une una operación con el runtime de Supabase: exige una sesión de usuario
// válida y entrega a la operación un cliente que solo puede llamar a las
// funciones del esquema app.

import { withSupabase } from '@supabase/server'
import { handle, type Operation, type Rpc } from './handle.ts'

export function endpoint<Input>(operation: Operation<Input>) {
  return {
    fetch: withSupabase({ auth: 'user', errors: { detailed: false } }, (request, ctx) => {
      const rpc: Rpc = (fn, args) => ctx.supabaseAdmin.schema('app').rpc(fn, args)
      return handle(operation, request, ctx.userClaims?.id, rpc)
    }),
  }
}

type Runtime = {
  Deno?: { env: { get(name: string): string | undefined } }
  process?: { env: Record<string, string | undefined> }
}

/** Variable de entorno del servidor, en Deno (Edge Functions) o en Node (tests). */
export function serverEnv(name: string): string | undefined {
  const runtime = globalThis as Runtime
  return runtime.Deno ? runtime.Deno.env.get(name) : runtime.process?.env[name]
}
