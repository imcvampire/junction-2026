import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? '8000'}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    host: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
})
