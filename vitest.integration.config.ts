import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * Tests de integración: corren contra el Supabase real.
 *
 * Van en una configuración aparte a propósito. `npm test` debe ser rápido,
 * determinista y ejecutable sin credenciales; esto es lo contrario, y se lanza
 * a mano cuando se quiere comprobar el sistema entero.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.itest.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Comparten usuario y datos: en paralelo se pisarían.
    fileParallelism: false,
  },
})
