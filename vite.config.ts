/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// base '/BarnaBank/' = repositório urlmistas/BarnaBank no GitHub Pages (https://urlmistas.github.io/BarnaBank/)
// versão mostrada em Configurações: commit do build (sem git → 'dev')
function gitVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  base: '/BarnaBank/',
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // os testes de tela (jsdom) ficam lentos quando rodam todos juntos
    testTimeout: 30000,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
