import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const SERVICE_WORKER = 'sw.js'
const MANIFEST_PLACEHOLDER = '__SHELL_MANIFEST__'

/**
 * Le entrega al service worker la lista de archivos de la aplicación y una
 * versión que cambia cuando cambia cualquiera de ellos.
 */
function shellManifest(): Plugin {
  return {
    name: 'santo-y-sena:shell-manifest',
    apply: 'build',
    generateBundle: {
      // Después de los demás plugins, para que index.html ya esté en el bundle.
      order: 'post',
      handler(_options, bundle) {
        const worker = bundle[SERVICE_WORKER]
        if (worker?.type !== 'chunk' || !worker.code.includes(MANIFEST_PLACEHOLDER)) {
          this.error(`${SERVICE_WORKER} no trae el texto ${MANIFEST_PLACEHOLDER}: no hay dónde escribir la lista de archivos.`)
        }
        if (!bundle['index.html']) this.error('index.html no está en el bundle: sin la página no hay nada que abrir sin conexión.')
        const version = createHash('sha256')
        const files: string[] = []
        const add = (name: string, content: string | Uint8Array) => {
          // La lista termina dentro de una cadena de JavaScript: solo nombres que no necesitan escape.
          if (!/^[\w./-]+$/.test(name)) this.error(`El archivo "${name}" tiene caracteres que la lista del service worker no admite. Renómbralo con letras, números, punto, guion o guion bajo.`)
          version.update(name).update(content)
          files.push(name === 'index.html' ? './' : name)
        }
        for (const name of Object.keys(bundle).sort()) {
          if (name === SERVICE_WORKER) continue
          const file = bundle[name]!
          add(name, file.type === 'chunk' ? file.code : file.source)
        }
        for (const name of readdirSync('public').sort()) add(name, readFileSync(`public/${name}`))
        const manifest = JSON.stringify({ version: version.digest('hex').slice(0, 16), files })
        worker.code = worker.code.replace(MANIFEST_PLACEHOLDER, () => JSON.stringify(manifest).slice(1, -1))
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), shellManifest()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', sw: 'src/pwa/sw.ts' },
      output: {
        // El service worker va en la raíz y sin hash: su dirección define qué controla.
        entryFileNames: (chunk) => (chunk.name === 'sw' ? SERVICE_WORKER : 'assets/[name]-[hash].js'),
      },
    },
  },
})
