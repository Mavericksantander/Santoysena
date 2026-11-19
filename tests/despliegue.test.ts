import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// `supabase config push` solo acepta plantillas dentro de su carpeta de
// trabajo, así que el proyecto alojado necesita su propia copia.
test('el correo del proyecto alojado es el mismo que prueba el CI', () => {
  const tested = readFileSync('supabase/templates/codigo.html', 'utf8')
  const deployed = readFileSync('despliegue/supabase/templates/codigo.html', 'utf8')
  expect(deployed, 'Copia supabase/templates/codigo.html a despliegue/supabase/templates/ y vuelve a correr config push.').toBe(tested)
})
