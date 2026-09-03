import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://fantasy.premierleague.com',
        changeOrigin: true,
      },
      '/data': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/eda': {
        target: 'https://fantasy.premierleague.com',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/venv/**']
    }
  }
})
