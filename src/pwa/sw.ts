/// <reference lib="webworker" />
import { shellCache, type ShellManifest } from './shell-cache.ts'

declare const self: ServiceWorkerGlobalScope

// El build reemplaza este texto por la lista real de archivos (vite.config.ts).
const manifest: ShellManifest = JSON.parse('__SHELL_MANIFEST__')
const shell = shellCache(caches, self.registration.scope, manifest)

self.addEventListener('install', (event) => {
  event.waitUntil(shell.install().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(shell.activate().then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const file = shell.fileFor(event.request)
  if (file) event.respondWith(shell.read(file).then((stored) => stored ?? fetch(event.request)))
})
