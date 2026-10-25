/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// base '/BarnaBank/' = repositório urlmistas/BarnaBank no GitHub Pages (https://urlmistas.github.io/BarnaBank/)
// versão mostrada em Configurações: commit do build (sem git → 'dev')
function gitVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

/** troca __BUILD_ID__ em dist/sw.js: um id novo por build faz o navegador instalar o worker novo e limpar o cache antigo */
function stampServiceWorker(): Plugin {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'bb-stamp-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
      root = c.root
    },
    closeBundle() {
      const file = join(root, outDir, 'sw.js')
      try {
        const id = Date.now().toString(36) + '-' + gitVersion()
        writeFileSync(file, readFileSync(file, 'utf8').replace(/__BUILD_ID__/g, id))
      } catch {
        // sem sw.js no resultado do build: nada a carimbar
      }
    },
  }
}

export default defineConfig({
  base: '/BarnaBank/',
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react(), tailwindcss(), stampServiceWorker()],
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
