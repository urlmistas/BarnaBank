import { describe, expect, it } from 'vitest'
import type { Fetch } from '@/lib/cloud'
import { codeLabel, linkCreate, linkRemove, linkStatus } from './telegram-link'
import { json } from './test-helpers'

const BASE = 'https://bot.exemplo.workers.dev'

function srv(reply: unknown, status = 200) {
  const calls: { method: string; url: string; auth: string | null }[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ method: init?.method ?? 'GET', url, auth: ((init?.headers ?? {}) as Record<string, string>).Authorization ?? null })
    return json(reply, status)
  }
  return { f, calls }
}

describe('telegram-link', () => {
  it('status: GET /api/link com o token da conta', async () => {
    const { f, calls } = srv({ linked: true, bot: 'barna_bot', at: null })
    expect((await linkStatus(f, 'tok', BASE)).linked).toBe(true)
    expect(calls[0]).toEqual({ method: 'GET', url: BASE + '/api/link', auth: 'Bearer tok' })
  })

  it('código: POST; desvincular: DELETE', async () => {
    const a = srv({ code: 'K7M2Q9XA', expiresIn: 600, bot: 'b', url: 'https://t.me/b?start=BBK7M2Q9XA' })
    expect((await linkCreate(a.f, 'tok', BASE)).code).toBe('K7M2Q9XA')
    expect(a.calls[0].method).toBe('POST')
    const b = srv({ ok: true })
    await linkRemove(b.f, 'tok', BASE)
    expect(b.calls[0].method).toBe('DELETE')
  })

  it('erro do bot vira BotError com o status; sem rede também', async () => {
    await expect(linkStatus(srv({}, 401).f, 'x', BASE)).rejects.toMatchObject({ status: 401 })
    const down: Fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(linkCreate(down, 'x', BASE)).rejects.toThrow(/failed to fetch/i)
  })

  it('codeLabel separa em dois blocos', () => {
    expect(codeLabel('K7M2Q9XA')).toBe('K7M2 Q9XA')
  })
})
