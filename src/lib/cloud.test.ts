import { describe, expect, it } from 'vitest'
import {
  CloudError, cloudErrorText, isAuthError, pullState, readSession, SB_KEY, SB_URL, SESSION_KEY, signIn, validSession, writeSession,
  type CloudSession, type Fetch,
} from './cloud'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/** fetch falso: responde pela rota e anota as chamadas */
function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ url, method: init?.method || 'GET', headers: init?.headers as Record<string, string>, body: init?.body as string })
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) throw new TypeError('Failed to fetch')
    const r = routes[key]
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }
  return { f, calls }
}

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0)
const sess: CloudSession = { access: 'a1', refresh: 'r1', exp: NOW / 1000 + 3600, uid: 'u-1', email: 'eu@x.com' }

describe('nuvem: login e sessão', () => {
  it('login por senha monta a sessão e manda a chave publicável', async () => {
    const { f, calls } = fakeFetch({
      'grant_type=password': { body: { access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u-9', email: 'a@b.com' } } },
    })
    const s = await signIn(f, 'a@b.com', 'segredo', NOW)
    expect(s).toEqual({ access: 'A', refresh: 'R', exp: NOW / 1000 + 3600, uid: 'u-9', email: 'a@b.com' })
    expect(calls[0].url).toBe(SB_URL + '/auth/v1/token?grant_type=password')
    expect(calls[0].headers.apikey).toBe(SB_KEY)
    expect(JSON.parse(calls[0].body!)).toEqual({ email: 'a@b.com', password: 'segredo' })
  })
  it('erro de credencial vira texto em português', async () => {
    const { f } = fakeFetch({ token: { status: 400, body: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } } })
    const e = await signIn(f, 'a@b.com', 'x', NOW).catch((x) => x)
    expect(e).toBeInstanceOf(CloudError)
    expect(cloudErrorText(e)).toBe('E-mail ou senha incorretos.')
    expect(isAuthError(e)).toBe(true)
  })
  it('sem rede', async () => {
    const { f } = fakeFetch({})
    expect(cloudErrorText(await signIn(f, 'a@b.com', 'x').catch((x) => x))).toBe('Sem conexão com a internet.')
  })
  it('token ainda válido não chama a rede; vencendo, renova e mantém uid/e-mail', async () => {
    const { f, calls } = fakeFetch({ refresh_token: { body: { access_token: 'A2', refresh_token: 'R2', expires_in: 3600 } } })
    expect(await validSession(f, sess, NOW)).toBe(sess)
    expect(calls).toHaveLength(0)
    const old = { ...sess, exp: NOW / 1000 + 30 }
    const s = await validSession(f, old, NOW)
    expect(s).toMatchObject({ access: 'A2', refresh: 'R2', uid: 'u-1', email: 'eu@x.com' })
    expect(JSON.parse(calls[0].body!)).toEqual({ refresh_token: 'r1' })
  })
})

describe('nuvem: leitura (somente GET)', () => {
  const row = {
    data: {
      app: 'BarnaBank', version: 2,
      wallets: [{ id: 'w', name: 'Conta', icon: 'landmark' }],
      transactions: [{ id: 't', walletId: 'w', type: 'entrada', amount: 10, date: '2026-10-01' }],
      debts: [], bills: [], cards: [], cardPurchases: [], cardPayments: [], groups: [], contacts: {},
      settings: { currency: 'USD', dateFormat: 'iso' },
    },
    updated_at: '2026-10-22T10:00:00Z',
  }
  it('lê a linha do usuário e normaliza como o localStorage', async () => {
    const { f, calls } = fakeFetch({ bb_user_state: { body: [row] } })
    const r = await pullState(f, sess, '2026-10-23')
    expect(r?.data.wallets).toEqual([{ id: 'w', name: 'Conta', icon: 'landmark' }])
    expect(r?.data.transactions).toHaveLength(1)
    expect(r?.settings).toMatchObject({ currency: 'USD', dateFormat: 'iso' })
    expect(r?.updatedAt).toBe('2026-10-22T10:00:00Z')
    expect(calls[0]).toMatchObject({ method: 'GET', url: SB_URL + '/rest/v1/bb_user_state?select=data,updated_at&user_id=eq.u-1' })
    expect(calls[0].headers.Authorization).toBe('Bearer a1')
  })
  it('conta sem linha ou com dado inválido → null', async () => {
    expect(await pullState(fakeFetch({ bb_user_state: { body: [] } }).f, sess, '2026-10-23')).toBeNull()
    expect(await pullState(fakeFetch({ bb_user_state: { body: [{ data: 'x', updated_at: '' }] } }).f, sess, '2026-10-23')).toBeNull()
  })
  it('nenhuma chamada grava na tabela (só GET em /rest)', async () => {
    const { f, calls } = fakeFetch({
      bb_user_state: { body: [row] },
      token: { body: { access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u-1' } } },
    })
    await signIn(f, 'a@b.com', 'x', NOW)
    await validSession(f, { ...sess, exp: 0 }, NOW)
    await pullState(f, sess, '2026-10-23')
    expect(calls.filter((c) => c.url.includes('/rest/')).every((c) => c.method === 'GET')).toBe(true)
  })
})

describe('nuvem: sessão no navegador', () => {
  function mem() {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
  }
  it('guarda só em bbweb_session e apaga ao sair', () => {
    const st = mem()
    writeSession(sess, st)
    expect([...st.m.keys()]).toEqual([SESSION_KEY])
    expect(SESSION_KEY.startsWith('bbweb_')).toBe(true)
    expect(readSession(st)).toEqual(sess)
    writeSession(null, st)
    expect(st.m.size).toBe(0)
  })
  it('sessão corrompida é ignorada', () => {
    const st = mem()
    st.setItem(SESSION_KEY, '{x')
    expect(readSession(st)).toBeNull()
    st.setItem(SESSION_KEY, JSON.stringify({ access: 'a' }))
    expect(readSession(st)).toBeNull()
  })
})
