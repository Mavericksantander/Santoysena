import { defineConfig } from 'vitest/config'

// Tests contra un Supabase local completo (`supabase start`). Los corre el CI.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
