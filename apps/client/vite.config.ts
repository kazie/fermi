import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fluentPlugin } from './vite/fluent.ts'

const api = process.env.FERMI_API ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [vue(), fluentPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '/api': api,
      '/voice': api, // FerMEANie's voice clips
      '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: {
    name: 'client',
    include: ['test/**/*.test.ts'],
    environment: 'happy-dom',
  },
})
