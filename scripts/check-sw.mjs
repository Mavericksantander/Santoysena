// Ejecuta el service worker construido contra un navegador falso y comprueba
// que guarda exactamente los archivos de `dist`, y que no se mete en las
// peticiones al servidor. Se corre después de `pnpm build`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { runInNewContext } from 'node:vm'

const SCOPE = 'https://app.test/carpeta/'
const SERVER = 'https://servidor.test/functions/v1/get-family-code'

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })

const failures = []
const fail = (message) => failures.push(message)

const listeners = {}
const stored = new Map()
const self = {
  registration: { scope: SCOPE },
  addEventListener: (type, listener) => (listeners[type] = listener),
  skipWaiting: () => Promise.resolve(),
  clients: { claim: () => Promise.resolve() },
}
const cache = {
  addAll: (urls) => Promise.resolve(urls.forEach((url) => stored.set(url, new Response(url)))),
  match: (url) => Promise.resolve(stored.get(url)),
}
const caches = { open: () => Promise.resolve(cache), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) }
const reachedNetwork = []
const fetch = (request) => {
  reachedNetwork.push(request.url)
  return Promise.resolve(new Response('de la red'))
}

const code = readFileSync('dist/sw.js', 'utf8')
if (/^\s*(import|export)\s/m.test(code)) {
  fail('dist/sw.js tiene import o export: el navegador lo carga como script clásico y no los admite. Revisa que src/pwa/sw.ts no comparta código con la aplicación.')
}
runInNewContext(code, { self, caches, fetch, URL, Set, JSON, Promise, Response })

for (const type of ['install', 'activate', 'fetch']) {
  if (!listeners[type]) fail(`dist/sw.js no escucha el evento "${type}".`)
}

if (failures.length === 0) {
  let installed
  listeners.install({ waitUntil: (promise) => (installed = promise) })
  await installed

  const expected = files('dist')
    .map((path) => relative('dist', path).split('\\').join('/'))
    .filter((path) => path !== 'sw.js')
    .map((path) => new URL(path === 'index.html' ? './' : path, SCOPE).href)
    .sort()
  const actual = [...stored.keys()].sort()
  for (const url of expected) {
    if (!actual.includes(url)) fail(`El service worker no guarda ${url}: sin conexión la aplicación quedaría incompleta. Revisa la lista que arma vite.config.ts.`)
  }
  for (const url of actual) {
    if (!expected.includes(url)) fail(`El service worker guarda ${url}, que no existe en dist: la instalación fallaría en el teléfono.`)
  }

  /** Simula una petición y dice con qué respondió el service worker, si respondió. */
  const respond = async (method, url) => {
    let answer
    listeners.fetch({ request: { method, url }, respondWith: (promise) => (answer = promise) })
    return answer ? (await answer).text() : null
  }
  if ((await respond('GET', `${SCOPE}#/familia`)) !== SCOPE) {
    fail('El service worker no responde la página con su copia guardada: la aplicación no abriría sin conexión.')
  }
  if ((await respond('POST', SERVER)) !== null || (await respond('GET', SERVER)) !== null) {
    fail('El service worker se mete en las peticiones al servidor. El código del día no puede pasar por él: solo debe responder archivos de la aplicación.')
  }
  if (reachedNetwork.length > 0) {
    fail(`El service worker fue a la red por ${reachedNetwork.join(', ')} teniendo la copia guardada.`)
  }
}

const registers = files('dist/assets').some((path) => path.endsWith('.js') && readFileSync(path, 'utf8').includes('sw.js'))
if (!registers) {
  fail('La aplicación construida no nombra sw.js: nadie registra el service worker. Revisa la llamada a registerServiceWorker en src/main.tsx.')
}

for (const message of failures) console.error(message)
if (failures.length > 0) process.exit(1)
console.log('Service worker: guarda los archivos de la aplicación y nada más.')
