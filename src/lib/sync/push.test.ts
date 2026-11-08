import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installStorage, json } from './test-helpers'
import { PushError, disablePush, enablePush, keyBytes, pushEnabled, pushSupported, testPush } from './push'
import { writeBotCfg } from './worker'

const BOT = 'https://bot.exemplo.workers.dev'

interface Call {
  method: string
  path: string
  body?: Record<string, unknown>
}

/** navegador de mentira: service worker, PushManager e Notification */
function fakeBrowser(permission: NotificationPermission = 'granted') {
  let current: { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null = null
  const subscribed: unknown[] = []
  const pushManager = {
    getSubscription: async () => current,
    subscribe: async (opts: { applicationServerKey: Uint8Array; userVisibleOnly: boolean }) => {
      subscribed.push(opts)
      current = {
        endpoint: 'https://push.test/abc',
        toJSON: () => ({ endpoint: 'https://push.test/abc', keys: { p256dh: 'p', auth: 'a' } }),
        unsubscribe: async () => {
          current = null
          return true
        },
      }
      return current
    },
  }
  const reg = { pushManager }
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => reg } })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { requestPermission: async () => permission })
  vi.stubGlobal('window', globalThis)
  return { subscribed, isOn: () => current !== null }
}

function bot() {
  const calls: Call[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    const path = url.replace(BOT, '')
    calls.push({ method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (init?.method === 'POST' && JSON.parse(String(init.body)).test) return json({ ok: true, sent: 2 })
    return json({ key: 'BPhh-_8', devices: 0, ok: true })
  }
  return { calls, env: { fetcher, token: async () => 't' } }
}

beforeEach(() => {
  installStorage()
  writeBotCfg({ url: BOT, key: 'chave-super-secreta-123' })
})
afterEach(() => vi.unstubAllGlobals())

describe('push: navegador', () => {
  it('keyBytes decodifica base64url (com - e _) em bytes', () => {
    expect(Array.from(keyBytes('-_8'))).toEqual([251, 255])
    expect(Array.from(keyBytes('AQID'))).toEqual([1, 2, 3])
  })

  it('sem suporte, nada está ligado e ligar avisa', async () => {
    vi.stubGlobal('navigator', {})
    expect(pushSupported()).toBe(false)
    expect(await pushEnabled()).toBe(false)
    await expect(enablePush(bot().env)).rejects.toBeInstanceOf(PushError)
  })

  it('ligar: pede permissão, pega a chave do bot, inscreve e manda a inscrição ao bot', async () => {
    const b = fakeBrowser()
    const srv = bot()
    expect(await pushEnabled()).toBe(false)
    await enablePush(srv.env)
    expect(await pushEnabled()).toBe(true)
    expect(b.subscribed).toHaveLength(1)
    expect((b.subscribed[0] as { userVisibleOnly: boolean }).userVisibleOnly).toBe(true)
    expect(srv.calls.map((c) => c.method + ' ' + c.path)).toEqual(['GET /api/push', 'POST /api/push'])
    expect(srv.calls[1].body).toEqual({ subscription: { endpoint: 'https://push.test/abc', keys: { p256dh: 'p', auth: 'a' } } })
  })

  it('permissão negada: não inscreve e explica', async () => {
    const b = fakeBrowser('denied')
    const srv = bot()
    await expect(enablePush(srv.env)).rejects.toThrow(/bloqueadas/)
    expect(b.isOn()).toBe(false)
    expect(srv.calls).toHaveLength(0)
  })

  it('desligar: avisa o bot e cancela a inscrição do aparelho', async () => {
    const b = fakeBrowser()
    const srv = bot()
    await enablePush(srv.env)
    srv.calls.length = 0
    await disablePush(srv.env)
    expect(b.isOn()).toBe(false)
    expect(srv.calls).toEqual([{ method: 'DELETE', path: '/api/push', body: { endpoint: 'https://push.test/abc' } }])
  })

  it('testar devolve quantos aparelhos receberam', async () => {
    fakeBrowser()
    expect(await testPush(bot().env)).toBe(2)
  })
})
