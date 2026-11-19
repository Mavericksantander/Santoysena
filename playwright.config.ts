import { defineConfig } from '@playwright/test'

// Prueba de punta a punta: la aplicación construida, en un navegador a tamaño
// de teléfono, contra un Supabase local completo. La corre el CI.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e-resultados',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 375, height: 812 },
    locale: 'es-CL',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})
