import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
// Vitest 3 reads this file automatically for aliases and plugins.
// Test-specific config (environment, globals) uses vitest defaults.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      '@xyflow/react',
      'lucide-react',
      'pdfjs-dist',
      'react',
      'react-dom',
      'react/jsx-runtime',
      'zustand',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
