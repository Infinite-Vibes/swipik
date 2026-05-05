import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri expects a fixed port and standard index.html output
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  server: {
    port: 5299,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5300 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // Prevent Tauri from stripping debug info in dev builds
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
})
