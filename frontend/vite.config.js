
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite configuration for the Inventory & POS frontend
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
})
