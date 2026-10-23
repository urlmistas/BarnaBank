import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from '@/lib/storage'
import { commit, replaceDebt, restore, setPhone } from './store'

class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

let ls: MemStorage
beforeEach(() => {
  ls = new MemStorage()
  vi.stubGlobal('localStorage', ls)
  vi.stubGlobal('dispatchEvent', vi.fn())
})

const debt = (id: string) => ({ id, name: 'Ana', kind: 'receivable', principal: 100, date: '2026-01-01', days: 30, payments: [] })

describe('commit', () => {
  it('cria o armazenamento quando não existe', () => {
    const r = commit((api) => api.debts.push(debt('a') as never))
    expect(r.ok && r.before).toBeNull()
    expect(JSON.parse(ls.getItem(STORAGE_KEY)!).debts).toHaveLength(1)
  })

  it('preserva os campos que o app novo não conhece', () => {
    const seed = { debts: [debt('a')], budgets: { Mercado: 500 }, goals: [{ id: 'g' }], shares: { tok: { type: 'person' } }, tgLog: { x: 1 } }
    ls.setItem(STORAGE_KEY, JSON.stringify(seed))
    commit((api) => replaceDebt(api, 'a', (d) => ({ ...d, notes: 'oi' })))
    const out = JSON.parse(ls.getItem(STORAGE_KEY)!)
    expect(out.budgets).toEqual({ Mercado: 500 })
    expect(out.goals).toEqual([{ id: 'g' }])
    expect(out.shares).toEqual({ tok: { type: 'person' } })
    expect(out.tgLog).toEqual({ x: 1 })
    expect(out.debts[0].notes).toBe('oi')
  })

  it('aceita o formato antigo (lista de dívidas)', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify([debt('a')]))
    commit((api) => api.debts.push(debt('b') as never))
    expect(JSON.parse(ls.getItem(STORAGE_KEY)!).debts).toHaveLength(2)
  })

  it('recusa JSON corrompido sem sobrescrever', () => {
    ls.setItem(STORAGE_KEY, '{quebrado')
    const r = commit((api) => api.debts.push(debt('a') as never))
    expect(r.ok).toBe(false)
    expect(ls.getItem(STORAGE_KEY)).toBe('{quebrado')
  })

  it('restore volta ao texto anterior', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt('a')] }))
    const r = commit((api) => (api.debts = []))
    if (!r.ok) throw new Error('falhou')
    restore(r.before)
    expect(JSON.parse(ls.getItem(STORAGE_KEY)!).debts).toHaveLength(1)
  })

  it('restore recusa quando os dados mudaram depois', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt('a')] }))
    const r = commit((api) => (api.debts = []))
    if (!r.ok) throw new Error('falhou')
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt('z')] }))
    expect(restore(r.before, r.after)).toBe(false)
    expect(JSON.parse(ls.getItem(STORAGE_KEY)!).debts[0].id).toBe('z')
  })

  it('restore de "nada" apaga a chave', () => {
    const r = commit((api) => api.debts.push(debt('a') as never))
    if (!r.ok) throw new Error('falhou')
    restore(r.before)
    expect(ls.getItem(STORAGE_KEY)).toBeNull()
  })

  it('avisa o app e erro de gravação vira mensagem', () => {
    const dispatch = vi.fn()
    vi.stubGlobal('dispatchEvent', dispatch)
    commit(() => {})
    expect(dispatch).toHaveBeenCalled()
    ls.setItem = () => {
      throw Object.assign(new Error('x'), { name: 'QuotaExceededError' })
    }
    const r = commit(() => {})
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/cheio/) })
  })

  it('altera carteiras e lançamentos sem normalizar nem perder campos', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [], wallets: [{ id: 'w1', name: 'Nubank', extra: 'x' }], transactions: [] }))
    commit((api) => {
      api.transactions.push({ id: 't1', walletId: 'w1', type: 'entrada', amount: 5, date: '2026-01-01' })
    })
    const out = JSON.parse(ls.getItem(STORAGE_KEY)!)
    expect(out.wallets).toEqual([{ id: 'w1', name: 'Nubank', extra: 'x' }])
    expect(out.transactions).toHaveLength(1)
    expect(out.bills).toBeUndefined()
  })

  it('api.raw deixa mexer em chaves sem lista própria, sem perder as outras', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [], budgets: { Mercado: 500 }, goals: [{ id: 'g' }] }))
    commit((api) => {
      api.raw.budgets = { ...(api.raw.budgets as object), Lazer: 100 }
    })
    const out = JSON.parse(ls.getItem(STORAGE_KEY)!)
    expect(out.budgets).toEqual({ Mercado: 500, Lazer: 100 })
    expect(out.goals).toEqual([{ id: 'g' }])
  })

  it('guarda o telefone no contato pelo nome em minúsculas', () => {
    commit((api) => setPhone(api, '  Ana Souza ', '11999998888'))
    expect(JSON.parse(ls.getItem(STORAGE_KEY)!).contacts['ana souza']).toEqual({ phone: '11999998888' })
  })
})
