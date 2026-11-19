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
