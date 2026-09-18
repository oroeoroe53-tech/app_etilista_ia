import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Los tests cubren lógica determinista: scoring, filtros, límites, parsing.
    // No arrancan Next ni tocan la red.
    globals: false,
  },
})
