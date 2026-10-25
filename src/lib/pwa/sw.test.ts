import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// Carrega public/sw.js num "ServiceWorkerGlobalScope" falso e dispara eventos de fetch.

type Handler = (e: unknown) => void

function loadSw(fetchImpl: (r: Request) => Promise<Response>) {
  const handlers: Record<string, Handler> = {}
  const stores = new Map<string, Map<string, Response>>()
  const keyOf = (r: Request | string) => (typeof r === 'string' ? r : r.url)
  const caches = {
    async keys() {
      return [...stores.keys()]
    },
    async delete(n: string) {
      return stores.delete(n)
    },
    async open(n: string) {
      if (!stores.has(n)) stores.set(n, new Map())
      const m = stores.get(n)!
      return {
        async match(r: Request | string) {
          return m.get(keyOf(r))?.clone()
        },
        async put(r: Request | string, res: Response) {
          m.set(keyOf(r), res)
        },
        async keys() {
          return [...m.keys()].map((u) => new Request(u))
        },
        async delete(r: Request | string) {
          return m.delete(keyOf(r))
        },
      }
    },
  }
  const src = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8').replace(/__BUILD_ID__/g, 'teste')
  const self = {
    location: new URL('https://x.github.io/BarnaBank/sw.js'),
    registration: { scope: 'https://x.github.io/BarnaBank/' },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener: (t: string, h: Handler) => (handlers[t] = h),
  }
  runInNewContext(src, { self, caches, fetch: fetchImpl as unknown as typeof fetch, Response, Request, URL })
  async function fire(url: string, init: RequestInit & { mode?: RequestMode } = {}) {
    // Request.mode não aceita 'navigate' no construtor; a navegação é simulada por um objeto com os mesmos campos
    const fake = init.mode === 'navigate' ? { method: 'GET', url, mode: 'navigate' } : new Request(url, init)
    let responded: Promise<Response> | undefined
    handlers.fetch({ request: fake, respondWith: (p: Promise<Response>) => (responded = p) })
    return responded ? await responded : undefined
  }
  return { fire, stores, handlers, activate: () => new Promise<void>((ok) => handlers.activate({ waitUntil: (p: Promise<void>) => p.then(ok) })) }
}

const ok = (body: string) => new Response(body, { status: 200 })

describe('service worker', () => {
  it('não toca em requisições de outra origem (Supabase, worker do bot)', async () => {
    const sw = loadSw(async () => ok('x'))
    expect(await sw.fire('https://epsddfqunjqopylrbbyv.supabase.co/rest/v1/bb_user_state')).toBeUndefined()
    expect(await sw.fire('https://barnabank-bot.exemplo.workers.dev/api/state')).toBeUndefined()
  })

  it('não toca em POST nem em fora do escopo nem no próprio sw.js', async () => {
    const sw = loadSw(async () => ok('x'))
    expect(await sw.fire('https://x.github.io/BarnaBank/assets/a.js', { method: 'POST' })).toBeUndefined()
    expect(await sw.fire('https://x.github.io/barna-bank/index.html')).toBeUndefined()
    expect(await sw.fire('https://x.github.io/BarnaBank/sw.js')).toBeUndefined()
  })

  it('página: rede primeiro; se a rede cai, usa a cópia', async () => {
    let online = true
    const sw = loadSw(async () => {
      if (!online) throw new TypeError('offline')
      return ok('v1')
    })
    expect(await (await sw.fire('https://x.github.io/BarnaBank/', { mode: 'navigate' }))!.text()).toBe('v1')
    online = false
    expect(await (await sw.fire('https://x.github.io/BarnaBank/', { mode: 'navigate' }))!.text()).toBe('v1')
  })

  it('página: versão nova da rede vence a cópia velha (nada de versão presa)', async () => {
    let body = 'v1'
    const sw = loadSw(async () => ok(body))
    await sw.fire('https://x.github.io/BarnaBank/', { mode: 'navigate' })
    body = 'v2'
    expect(await (await sw.fire('https://x.github.io/BarnaBank/', { mode: 'navigate' }))!.text()).toBe('v2')
  })

  it('assets com hash: cache primeiro', async () => {
    let calls = 0
    const sw = loadSw(async () => {
      calls++
      return ok('js')
    })
    await sw.fire('https://x.github.io/BarnaBank/assets/index-abc.js')
    const again = await sw.fire('https://x.github.io/BarnaBank/assets/index-abc.js')
    expect(await again!.text()).toBe('js')
    expect(calls).toBe(1)
  })

  it('ativar apaga caches de versões antigas e mantém os atuais', async () => {
    const sw = loadSw(async () => ok('x'))
    sw.stores.set('bb-shell-velha', new Map())
    sw.stores.set('bb-assets', new Map())
    sw.stores.set('outra-coisa', new Map())
    await sw.activate()
    expect([...sw.stores.keys()].sort()).toEqual(['bb-assets'])
  })
})
