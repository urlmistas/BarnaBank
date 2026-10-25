// Service worker do BarnaBank: só guarda o próprio app (HTML, JS, CSS, ícones) para abrir rápido e funcionar offline.
// Regras que não mudam:
// - só atende GET da MESMA origem e do escopo do app; nunca toca em Supabase, no worker do bot nem em nada de fora;
// - a página (HTML) vem SEMPRE da rede primeiro, então uma versão nova aparece no próximo carregamento (nada de versão presa);
//   a cópia guardada só serve quando a rede falha;
// - arquivos de /assets/ têm o hash no nome (nunca mudam): cache primeiro.
// __BUILD_ID__ é trocado a cada build (vite.config.ts), o que faz o navegador instalar o worker novo e limpar o cache antigo.
const VERSION = '__BUILD_ID__'
const SHELL = 'bb-shell-' + VERSION
const ASSETS = 'bb-assets'
const MAX_ASSETS = 80

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== SHELL && n !== ASSETS).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

async function trim(cache) {
  const keys = await cache.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(k)
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL)
  const key = self.registration.scope
  try {
    const res = await fetch(request)
    if (res && res.ok) await cache.put(key, res.clone())
    return res
  } catch (e) {
    const hit = await cache.match(key)
    if (hit) return hit
    throw e
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSETS)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res && res.ok) {
    await cache.put(request, res.clone())
    await trim(cache)
  }
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL)
  const hit = await cache.match(request)
  const net = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone())
      return res
    })
    .catch(() => undefined)
  return hit || (await net) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const scope = new URL(self.registration.scope)
  if (!url.pathname.startsWith(scope.pathname)) return
  if (url.pathname === scope.pathname + 'sw.js') return

  if (request.mode === 'navigate') event.respondWith(networkFirstPage(request))
  else if (url.pathname.startsWith(scope.pathname + 'assets/')) event.respondWith(cacheFirstAsset(request))
  else event.respondWith(staleWhileRevalidate(request))
})
