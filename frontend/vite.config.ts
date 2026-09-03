import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev runs against the deployed Vercel serverless functions.
    // Set VITE_API_ORIGIN to your Vercel URL (or use `vercel dev` instead).
    proxy: {
      '/api': {
        target: process.env.VITE_API_ORIGIN || 'https://fplgeek-ipupauzmg-vishnuprkshs-projects.vercel.app',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/venv/**']
    }
  }
})
