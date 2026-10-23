import { beforeEach, describe, expect, it } from 'vitest'
import { CloudError, SB_URL, type CloudSession, type Fetch } from '@/lib/cloud'
import { SETTINGS_KEY, STORAGE_KEY } from '@/lib/storage'
import { localHash } from './snapshot'
import { sbPushIfChanged, sbResolve, sbSync, type SyncEnv } from './supabase'
import { installStorage, json, type MemStorage } from './test-helpers'

let ls: MemStorage
beforeEach(() => {
  ;({ ls } = installStorage())
})

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0)
const debt = (id: string) => ({ id, name: 'Ana', kind: 'receivable', principal: 100, date: '2026-01-01', days: 30, payments: [] })
const cloudData = (id: string) => ({ app: 'BarnaBank', debts: [debt(id)], settings: { currency: 'USD' } })

interface Call {
  method: string
  url: string
  body?: Record<string, unknown>
}

/** Supabase de mentira: uma linha, PATCH condicionado a updated_at, 409 no POST duplicado */
function server(initial: { data: Record<string, unknown>; updated_at: string } | null) {
  const st = { row: initial, calls: [] as Call[], afterGet: null as null | (() => void), status: 0 }
  let tick = 0
  const stamp = () => `2026-10-23T12:00:0${++tick}+00:00`
  const f: Fetch = async (url, init) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    st.calls.push({ method, url: url.replace(SB_URL, ''), body })
    if (st.status) return json({ message: 'nope' }, st.status)
    if (url.includes('grant_type=refresh_token')) return json({ access_token: 'A2', refresh_token: 'R2', expires_in: 3600 })
    if (method === 'GET') {
      const out = st.row ? [st.row] : []
      st.afterGet?.()
      st.afterGet = null
      return json(out)
    }
    if (method === 'PATCH') {
      const want = decodeURIComponent(url.split('updated_at=eq.')[1])
      if (!st.row || st.row.updated_at !== want) return json([])
      st.row = { data: body!.data as Record<string, unknown>, updated_at: stamp() }
      return json([st.row])
    }
    if (method === 'POST') {
      if (st.row) return json({ code: '23505', message: 'duplicate key' }, 409)
      st.row = { data: body!.data as Record<string, unknown>, updated_at: stamp() }
      return json([st.row])
    }
    return json({}, 404)
  }
  return { st, f }
}

function env(f: Fetch, over: Partial<CloudSession> = {}) {
  const box = { s: { access: 'a', refresh: 'r', exp: NOW / 1000 + 3600, uid: 'u1', email: 'eu@x.com', ...over } as CloudSession | null }
  const saved: (CloudSession | null)[] = []
  const e: SyncEnv = {
    fetcher: f,
    session: () => box.s,
    save: (s) => {
      box.s = s
      saved.push(s)
    },
    now: () => new Date(NOW),
  }
  return { e, box, saved }
}

const putLocal = (id: string) => ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt(id)] }))
const localIds = () => (JSON.parse(ls.getItem(STORAGE_KEY) ?? '{"debts":[]}').debts as { id: string }[]).map((d) => d.id)

describe('sbSync', () => {
  it('sem sessão não faz nada', async () => {
    const { f } = server(null)
    const { e, box } = env(f)
    box.s = null
    expect(await sbSync(e)).toEqual({ kind: 'off' })
  })

  it('conta sem linha e aparelho com dados: sobe o aparelho e marca rev e synced', async () => {
    putLocal('a')
    const { st, f } = server(null)
    const { e, box } = env(f)
    expect(await sbSync(e, { initial: true })).toEqual({ kind: 'pushed' })
    expect(st.calls.map((c) => c.method)).toEqual(['GET', 'POST'])
    expect((st.row!.data.debts as unknown[]).length).toBe(1)
    expect(st.calls[1].body).toMatchObject({ user_id: 'u1' })
    expect(box.s).toMatchObject({ rev: st.row!.updated_at, synced: localHash() })
  })

  it('conta sem linha e aparelho vazio, fora do initial: nada', async () => {
    const { st, f } = server(null)
    const { e } = env(f)
    expect(await sbSync(e)).toEqual({ kind: 'noop' })
    expect(st.calls.map((c) => c.method)).toEqual(['GET'])
  })

  it('aparelho vazio e conta com dados: adota a conta (com as configurações)', async () => {
    const { f } = server({ data: cloudData('nuvem'), updated_at: 'T1' })
    const { e, box } = env(f)
    expect(await sbSync(e, { initial: true })).toEqual({ kind: 'adopted' })
    expect(localIds()).toEqual(['nuvem'])
    expect(JSON.parse(ls.getItem(SETTINGS_KEY)!)).toEqual({ currency: 'USD' })
    expect(box.s).toMatchObject({ rev: 'T1', synced: localHash() })
  })

  it('aparelho sem mudanças e conta nova: adota; mesma versão: nada', async () => {
    putLocal('a')
    const { st, f } = server({ data: cloudData('nuvem'), updated_at: 'T2' })
    const { e, box } = env(f, { rev: 'T1', synced: localHash() })
    expect(await sbSync(e)).toEqual({ kind: 'adopted' })
    expect(localIds()).toEqual(['nuvem'])
    st.calls.length = 0
    expect(await sbSync(e)).toEqual({ kind: 'noop' })
    expect(st.calls.map((c) => c.method)).toEqual(['GET'])
    expect(box.s?.rev).toBe('T2')
  })

  it('só o aparelho mudou: PATCH condicionado ao rev', async () => {
    putLocal('a')
    const { st, f } = server({ data: cloudData('nuvem'), updated_at: 'T1' })
    const { e, box } = env(f, { rev: 'T1', synced: 'hash-antigo' })
    expect(await sbSync(e)).toEqual({ kind: 'pushed' })
    const patch = st.calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toContain('user_id=eq.u1&updated_at=eq.T1')
    expect(localIds()).toEqual(['a'])
    expect(box.s).toMatchObject({ synced: localHash(), rev: st.row!.updated_at })
  })

  it('aparelho e conta mudaram: devolve o conflito e não altera nada', async () => {
    putLocal('a')
    const { st, f } = server({ data: cloudData('nuvem'), updated_at: 'T2' })
    const { e, box } = env(f, { rev: 'T1', synced: 'hash-antigo' })
    const r = await sbSync(e)
    expect(r).toMatchObject({ kind: 'conflict', row: { updated_at: 'T2' } })
    expect(st.calls.map((c) => c.method)).toEqual(['GET'])
    expect(localIds()).toEqual(['a'])
    expect(box.s?.rev).toBe('T1')
  })

  it('primeira vez neste aparelho com dados dos dois lados: conflito (nada de sobrescrever)', async () => {
    putLocal('a')
    const { f } = server({ data: cloudData('nuvem'), updated_at: 'T2' })
    const { e } = env(f)
    expect((await sbSync(e, { initial: true })).kind).toBe('conflict')
  })

  it('PATCH sem linhas (a conta mudou entre a leitura e o envio): esquece o rev e acaba em conflito', async () => {
    putLocal('a')
    const { st, f } = server({ data: cloudData('nuvem'), updated_at: 'T1' })
    st.afterGet = () => {
      st.row = { data: cloudData('outro-aparelho'), updated_at: 'T9' }
    }
    const { e, box } = env(f, { rev: 'T1', synced: 'hash-antigo' })
    const r = await sbSync(e)
    expect(r).toMatchObject({ kind: 'conflict', row: { updated_at: 'T9' } })
    expect(box.s?.rev).toBeUndefined()
    expect(localIds()).toEqual(['a'])
  })

  it('POST em linha que já existe (409) não vira erro nem sobrescreve', async () => {
    putLocal('a')
    // a linha existe mas ainda sem dados úteis: o aparelho tenta subir; o servidor responde 409
    const { st, f } = server({ data: { app: 'BarnaBank' }, updated_at: 'T1' })
    const { e } = env(f)
    const r = await sbSync(e, { initial: true })
    expect(st.calls.some((c) => c.method === 'POST')).toBe(true)
    expect(r.kind).not.toBe('pushed')
    expect(st.row!.data).toEqual({ app: 'BarnaBank' })
  })

  it('401 na leitura lança erro de autenticação (quem chama derruba a sessão)', async () => {
    const { st, f } = server(null)
    st.status = 401
    const { e } = env(f)
    const err = await sbSync(e).catch((x) => x)
    expect(err).toBeInstanceOf(CloudError)
    expect(err.status).toBe(401)
  })

  it('token vencido: renova e grava a sessão nova, mantendo rev e synced', async () => {
    putLocal('a')
    const { st, f } = server({ data: cloudData('a'), updated_at: 'T1' })
    const { e, saved } = env(f, { exp: NOW / 1000 + 10, rev: 'T1', synced: localHash() })
    expect(await sbSync(e)).toEqual({ kind: 'noop' })
    expect(st.calls[0].url).toContain('grant_type=refresh_token')
    expect(saved[0]).toMatchObject({ access: 'A2', refresh: 'R2', uid: 'u1', rev: 'T1', synced: localHash() })
  })

  it('não coloca senha nem token na URL', async () => {
    putLocal('a')
    const { st, f } = server(null)
    const { e } = env(f)
    await sbSync(e, { initial: true })
    for (const c of st.calls) expect(c.url).not.toMatch(/access|refresh|password|apikey/i)
  })
})

describe('sbResolve', () => {
  it('usar a conta: adota e marca rev', async () => {
    putLocal('a')
    const { f } = server({ data: cloudData('nuvem'), updated_at: 'T2' })
    const { e, box } = env(f, { rev: 'T1', synced: 'x' })
    const r = await sbResolve(e, { data: cloudData('nuvem'), updated_at: 'T2' }, true)
    expect(r).toEqual({ kind: 'adopted' })
    expect(localIds()).toEqual(['nuvem'])
    expect(box.s).toMatchObject({ rev: 'T2', synced: localHash() })
  })

  it('manter o do aparelho: assume a versão da conta como lida e sobe por cima', async () => {
    putLocal('a')
    const { st, f } = server({ data: cloudData('nuvem'), updated_at: 'T2' })
    const { e } = env(f, { rev: 'T1', synced: 'x' })
    const r = await sbResolve(e, { data: cloudData('nuvem'), updated_at: 'T2' }, false)
    expect(r).toEqual({ kind: 'pushed' })
    expect(st.calls[0].url).toContain('updated_at=eq.T2')
    expect((st.row!.data.debts as { id: string }[])[0].id).toBe('a')
    expect(localIds()).toEqual(['a'])
  })
})

describe('sbPushIfChanged', () => {
  it('nada mudou desde a última sincronização: não chama a rede', async () => {
    putLocal('a')
    const { st, f } = server(null)
    const { e } = env(f, { rev: 'T1', synced: localHash() })
    expect(await sbPushIfChanged(e)).toEqual({ kind: 'noop' })
    expect(st.calls).toHaveLength(0)
  })

  it('mudou: envia', async () => {
    putLocal('a')
    const { st, f } = server({ data: cloudData('a'), updated_at: 'T1' })
    const { e } = env(f, { rev: 'T1', synced: 'antigo' })
    expect(await sbPushIfChanged(e)).toEqual({ kind: 'pushed' })
    expect(st.calls.map((c) => c.method)).toEqual(['PATCH'])
  })

  it('nunca sincronizou nesta sessão: faz a sincronização completa (pode dar conflito)', async () => {
    putLocal('a')
    const { f } = server({ data: cloudData('nuvem'), updated_at: 'T2' })
    const { e } = env(f)
    expect((await sbPushIfChanged(e)).kind).toBe('conflict')
  })
})
