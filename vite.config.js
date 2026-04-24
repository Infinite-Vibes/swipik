import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5299, strictPort: true },
  build: {
    rollupOptions: {
      input: 'swypik.html',
    },
  },
})
