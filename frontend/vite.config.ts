import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // 5173 被占时明确报错，而不是静默跳到 5174 造成「连错实例」的困惑
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
