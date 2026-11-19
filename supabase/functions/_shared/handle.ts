// Núcleo de toda Edge Function, sin dependencias del runtime: valida la
// entrada, ejecuta la operación y convierte cualquier falla en una respuesta
// con un código estable. No escribe nada en logs.

import { AppError, type DatabaseError, type ErrorCode, fromDatabaseError } from './errors.ts'
import {
  InvalidInput,
  type Name,
  parseUuid,
  readJsonObject,
  type Role,
  type TtlSeconds,
  type Uuid,
} from './input.ts'

/** Funciones del esquema app y sus argumentos. Un nombre o argumento mal escrito no compila. */
export interface AppFunctions {
  create_family: { p_actor: Uuid; p_name: Name; p_timezone?: string }
  create_invitation: {
    p_actor: Uuid
    p_family_id: Uuid
    p_token_hash: string
    p_ttl_seconds: TtlSeconds
  }
  accept_invitation: { p_actor: Uuid; p_token_hash: string }
  list_family_members: { p_actor: Uuid; p_family_id: Uuid }
  remove_family_member: { p_actor: Uuid; p_family_id: Uuid; p_target: Uuid }
  set_member_role: { p_actor: Uuid; p_family_id: Uuid; p_target: Uuid; p_role: Role }
  family_code_context: { p_actor: Uuid; p_family_id: Uuid }
  list_families: { p_actor: Uuid }
}

export type Rpc = <F extends keyof AppFunctions>(
  fn: F,
  args: AppFunctions[F],
) => PromiseLike<{ data: unknown; error: DatabaseError | null }>

export type Call = <F extends keyof AppFunctions>(fn: F, args: AppFunctions[F]) => Promise<unknown>

export interface Operation<Input> {
  parse(body: Record<string, unknown>): Input
  run(call: Call, actor: Uuid, input: Input): Promise<Record<string, unknown>>
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const failure = (status: number, code: ErrorCode, extra: Record<string, unknown> = {}) =>
  json(status, { code, ...extra })

export async function handle<Input>(
  operation: Operation<Input>,
  request: Request,
  actorId: unknown,
  rpc: Rpc,
): Promise<Response> {
  if (request.method !== 'POST') return failure(405, 'method_not_allowed')

  const call: Call = async (fn, args) => {
    const { data, error } = await rpc(fn, args)
    if (error) throw fromDatabaseError(error)
    return data
  }

  try {
    const actor = parseUuid(actorId, 'actor')
    const input = operation.parse(await readJsonObject(request))
    return json(200, await operation.run(call, actor, input))
  } catch (error) {
    if (error instanceof InvalidInput) return failure(400, 'invalid_input', { field: error.field })
    if (error instanceof AppError) return failure(error.status, error.code)
    return failure(500, 'internal_error')
  }
}
