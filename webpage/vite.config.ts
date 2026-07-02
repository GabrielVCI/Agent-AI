import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// El alias `@/` apunta a `src/` tanto para Vite (runtime/build) como para TS (ver tsconfig.app.json).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
})
