import { beforeEach, describe, expect, it } from 'vitest'
import type { Fetch } from '@/lib/cloud'
import { STORAGE_KEY } from '@/lib/storage'
import { localHash } from './snapshot'
import { installStorage, json, type MemStorage } from './test-helpers'
import { BOT_KEY, BotError, botErrorText, botSync, readBotCfg, testBot, writeBotCfg } from './worker'

let ls: MemStorage
beforeEach(() => {
  ;({ ls } = installStorage())
})

const URL_BOT = 'https://bot.exemplo.workers.dev'
const KEY = 'chave-super-secreta-123'
const NOW = new Date('2026-10-23T12:00:00Z')

const debt = (id: string) => ({ id, name: 'Ana', kind: 'receivable', principal: 100, date: '2026-01-01', days: 30, payments: [] })
const putLocal = (id: string, extra: Record<string, unknown> = {}) => ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt(id)], ...extra }))
const localIds = () => (JSON.parse(ls.getItem(STORAGE_KEY) ?? '{"debts":[]}').debts as { id: string }[]).map((d) => d.id)

interface Call {
  method: string
  url: string
  auth: string | null
  body?: Record<string, unknown>
}

interface Srv {
  snapshot: Record<string, unknown> | null
  rev: number
  inbox: { id: string }[]
  undo: { id: string }[]
  /** ids que o "motor" do worker aplica por cima do snapshot recebido (simula o reaplicar do PUT) */
  reapply: string[]
  status: number
  onPut: null | (() => void)
  calls: Call[]
}

/** worker de mentira: GET devolve o estado; PUT guarda o snapshot, reaplica ops e confirma ack */
function worker(init: Partial<Srv> = {}) {
  const st: Srv = { snapshot: null, rev: 1, inbox: [], undo: [], reapply: [], status: 0, onPut: null, calls: [], ...init }
  const f: Fetch = async (url, init2) => {
    const method = init2?.method ?? 'GET'
    const headers = (init2?.headers ?? {}) as Record<string, string>
    const body = init2?.body ? (JSON.parse(String(init2.body)) as Record<string, unknown>) : undefined
    st.calls.push({ method, url, auth: headers.Authorization ?? null, body })
    if (st.status) return json({ error: 'x' }, st.status)
    if (method === 'GET') return json({ snapshot: st.snapshot, inbox: st.inbox, undo: st.undo, rev: st.rev, updatedAt: null })
    if (method === 'PUT') {
      st.onPut?.()
      if (body?.snapshot) {
        const snap = body.snapshot as Record<string, unknown>
        const tgLog = { ...((snap.tgLog as Record<string, unknown>) ?? {}) }
        for (const id of st.reapply) tgLog[id] = { debt: 'via-bot' }
        st.snapshot = { ...snap, tgLog }
        st.rev++
      }
      const ack = (body?.ack as string[]) ?? []
      st.inbox = st.inbox.filter((o) => !ack.includes(o.id))
      const undoAck = (body?.undoAck as string[]) ?? []
      st.undo = st.undo.filter((u) => !undoAck.includes(u.id))
      return json({ ok: true, rev: st.rev })
    }
    return json({}, 405)
  }
  return { st, f }
}

const env = (f: Fetch) => ({ fetcher: f, now: () => NOW })
const configure = (extra: Record<string, unknown> = {}) => writeBotCfg({ url: URL_BOT, key: KEY, ...extra })

describe('botSync', () => {
  it('sem endereço e chave: desligado, sem rede', async () => {
    const { st, f } = worker()
    expect(await botSync(env(f))).toEqual({ kind: 'off' })
    expect(st.calls).toHaveLength(0)
  })

  it('aparelho vazio e bot com dados: adota e marca rev e synced', async () => {
    configure()
    const { f } = worker({ snapshot: { debts: [debt('do-bot')], tgLog: { m1: {} } }, rev: 7 })
    expect(await botSync(env(f))).toEqual({ kind: 'adopted' })
    expect(localIds()).toEqual(['do-bot'])
    expect(readBotCfg()).toMatchObject({ rev: 7, synced: localHash(), last: NOW.toISOString(), err: '' })
  })

  it('aparelho sem mudanças e bot com versão nova (mensagem do Telegram): adota', async () => {
    putLocal('a')
    configure({ rev: 1, synced: localHash() })
    const { f } = worker({ snapshot: { debts: [debt('a'), debt('novo-do-telegram')] }, rev: 2 })
    expect(await botSync(env(f))).toEqual({ kind: 'adopted' })
    expect(localIds()).toEqual(['a', 'novo-do-telegram'])
    expect(readBotCfg().rev).toBe(2)
  })

  it('mesma versão e nada mudado: só registra a hora', async () => {
    putLocal('a')
    configure({ rev: 3, synced: localHash() })
    const { st, f } = worker({ snapshot: { debts: [debt('a')] }, rev: 3 })
    expect(await botSync(env(f))).toEqual({ kind: 'noop' })
    expect(st.calls.map((c) => c.method)).toEqual(['GET'])
    expect(readBotCfg().last).toBe(NOW.toISOString())
  })

  it('aparelho mudou: PUT do snapshot SEM ack nem summary/shares, depois GET e adota o resultado', async () => {
    putLocal('a', { budgets: { Mercado: 500 } })
    configure({ rev: 1, synced: 'antigo' })
    const { st, f } = worker({ snapshot: { debts: [] }, rev: 1, inbox: [{ id: 'op1' }], reapply: ['op1'] })
    expect(await botSync(env(f))).toEqual({ kind: 'pushed' })
    const put = st.calls.find((c) => c.method === 'PUT' && c.body?.snapshot)!
    expect(Object.keys(put.body!).sort()).toEqual(['snapshot'])
    expect((put.body!.snapshot as { budgets: unknown }).budgets).toEqual({ Mercado: 500 })
    expect(st.calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'GET', 'PUT'])
    // adotou o que o worker devolveu (com a mensagem reaplicada por cima)
    expect(JSON.parse(ls.getItem(STORAGE_KEY)!).tgLog.op1).toBeTruthy()
    expect(JSON.parse(ls.getItem(STORAGE_KEY)!).budgets).toEqual({ Mercado: 500 })
    expect(readBotCfg()).toMatchObject({ rev: 2, synced: localHash() })
  })

  it('confirma (ack) só as mensagens que já estão no tgLog daqui', async () => {
    putLocal('a')
    configure({ rev: 1, synced: 'antigo' })
    const { st, f } = worker({
      snapshot: { debts: [] }, inbox: [{ id: 'aplicada' }, { id: 'pendente' }], reapply: ['aplicada'],
      undo: [{ id: 'u-ok' }, { id: 'u-nao' }],
    })
    await botSync(env(f))
    const ackCall = st.calls.filter((c) => c.method === 'PUT').pop()!
    expect(ackCall.body).toEqual({ ack: ['aplicada'], undoAck: [] })
    expect(st.inbox).toEqual([{ id: 'pendente' }])
  })

  it('desfazer do Telegram só é confirmado quando o tgLog marca undone', async () => {
    putLocal('a', { tgLog: { u1: { undone: true }, u2: { debt: 'x' } } })
    configure({ rev: 5, synced: localHash() })
    const { st, f } = worker({ snapshot: { debts: [debt('a')] }, rev: 5, undo: [{ id: 'u1' }, { id: 'u2' }] })
    await botSync(env(f))
    const put = st.calls.find((c) => c.method === 'PUT')!
    expect(put.body).toEqual({ ack: [], undoAck: ['u1'] })
  })

  it('se a pessoa mexeu durante o envio, não sobrescreve os dados daqui', async () => {
    putLocal('a')
    configure({ rev: 1, synced: 'antigo' })
    const { st, f } = worker({ snapshot: { debts: [] } })
    const sent = localHash()
    st.onPut = () => putLocal('a-mexido')
    expect(await botSync(env(f))).toEqual({ kind: 'pushed' })
    expect(localIds()).toEqual(['a-mexido'])
    // `synced` fica no que foi enviado, então a próxima sincronização manda a mudança nova
    expect(readBotCfg().synced).toBe(sent)
    expect(localHash()).not.toBe(sent)
  })

  it('chave errada (401): erro curto, sem a chave, e nada é alterado', async () => {
    putLocal('a')
    configure({ rev: 1, synced: localHash() })
    const { f, st } = worker()
    st.status = 401
    const err = await botSync(env(f)).catch((x) => x)
    expect(err).toBeInstanceOf(BotError)
    expect(err.status).toBe(401)
    expect(readBotCfg().err).toBe('Chave errada.')
    expect(ls.getItem(BOT_KEY)).not.toContain('Chave errada.' + KEY)
    expect(localIds()).toEqual(['a'])
  })

  it('manda a chave no cabeçalho, não na URL, e normaliza a barra final do endereço', async () => {
    putLocal('a')
    configure({ url: URL_BOT + '///', synced: 'antigo' })
    const { st, f } = worker()
    await botSync(env(f))
    for (const c of st.calls) {
      expect(c.url).toBe(URL_BOT + '/api/state')
      expect(c.auth).toBe('Bearer ' + KEY)
    }
  })

  it('sem conexão: erro curto em português', async () => {
    configure()
    const f: Fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    const err = await botSync(env(f)).catch((x) => x)
    expect(botErrorText(err)).toBe('Sem conexão com o bot.')
    expect(readBotCfg().err).toBe('Sem conexão com o bot.')
  })
})

describe('testBot e configuração', () => {
  it('testa com GET e devolve o estado', async () => {
    const { st, f } = worker({ snapshot: { debts: [] }, rev: 4 })
    const r = await testBot(env(f), URL_BOT + '/', KEY)
    expect(r.rev).toBe(4)
    expect(st.calls[0]).toMatchObject({ method: 'GET', url: URL_BOT + '/api/state', auth: 'Bearer ' + KEY })
  })

  it('chave errada no teste', async () => {
    const { st, f } = worker()
    st.status = 401
    const err = await testBot(env(f), URL_BOT, 'errada').catch((x) => x)
    expect(botErrorText(err)).toBe('Chave errada.')
  })

  it('lê a configuração que o app antigo já tinha gravado (mesma chave)', () => {
    ls.setItem(BOT_KEY, JSON.stringify({ url: URL_BOT, key: KEY, rev: 9, synced: 'abc', last: 'ontem' }))
    expect(readBotCfg()).toMatchObject({ url: URL_BOT, rev: 9 })
    writeBotCfg(null)
    expect(ls.getItem(BOT_KEY)).toBeNull()
    expect(readBotCfg()).toEqual({})
  })
})
