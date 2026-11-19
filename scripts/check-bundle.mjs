// Falla si el bundle del cliente contiene algo que solo debe existir en el
// servidor. Se corre después de `pnpm build`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const FORBIDDEN = [
  [/sb_secret_/, 'una llave secreta de Supabase (sb_secret_...)'],
  [/service_role/, 'la llave o el rol service_role'],
  [/SERVER_SECRET/, 'el secreto del generador de códigos'],
  [/SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/, 'el nombre de una llave privilegiada'],
]

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })

let failures = 0
for (const file of files('dist')) {
  const content = readFileSync(file, 'utf8')
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(content)) {
      failures += 1
      console.error(
        `${file} contiene ${what}.\n` +
          '  Causa: código del cliente (src/) importa o lee algo privilegiado.\n' +
          '  Arreglo: lo privilegiado vive solo en supabase/functions y en las variables de\n' +
          '  entorno de las Edge Functions. El cliente solo usa la URL y la llave publicable.',
      )
    }
  }
}
if (failures > 0) process.exit(1)
console.log('Bundle sin llaves ni secretos del servidor.')
