import { importServerSecret } from '../_shared/daily-code.ts'
import { endpoint, serverEnv } from '../_shared/endpoint.ts'
import { getFamilyCode } from '../_shared/operations.ts'

export default endpoint(
  getFamilyCode({
    now: () => new Date(),
    serverSecret: () => importServerSecret(serverEnv('SERVER_SECRET')),
  }),
)
