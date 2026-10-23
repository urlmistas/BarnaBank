import { beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_KEY, STORAGE_KEY } from '@/lib/storage'
import { applySnapshot, BACKUP_PREV_KEY, buildSnapshot, hashStr, isLocalEmpty, localHash, readBackupPrev, snapshotHasData } from './snapshot'
import { installStorage, type MemStorage } from './test-helpers'

let ls: MemStorage
let events: string[]
beforeEach(() => {
  ;({ ls, events } = installStorage())
})

const debt = (id: string) => ({ id, name: 'Ana', kind: 'receivable', principal: 100, date: '2026-01-01', days: 30, payments: [] })

describe('buildSnapshot', () => {
  it('leva tudo do armazenamento, inclusive o que o app novo não conhece, e as configurações', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt('a')], budgets: { Mercado: 500 }, goals: [{ id: 'g' }], tgLog: { x: 1 }, futuro: { a: 1 } }))
    ls.setItem(SETTINGS_KEY, JSON.stringify({ currency: 'USD', pixKey: 'abc' }))
    const s = buildSnapshot(new Date('2026-10-23T12:00:00Z'))
    expect(s).toMatchObject({ app: 'BarnaBank', version: 2, exportedAt: '2026-10-23T12:00:00.000Z' })
    expect(s.debts).toHaveLength(1)
    expect(s.budgets).toEqual({ Mercado: 500 })
    expect(s.goals).toEqual([{ id: 'g' }])
    expect(s.tgLog).toEqual({ x: 1 })
    expect(s.futuro).toEqual({ a: 1 })
    expect(s.settings).toEqual({ currency: 'USD', pixKey: 'abc' })
  })

  it('sem nada guardado: listas vazias (como o backup do antigo) e sem comprovantes', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [], receipts: { r1: 'foto' } }))
    const s = buildSnapshot()
    for (const k of ['debts', 'wallets', 'transactions', 'groups', 'bills', 'cards', 'cardPurchases', 'cardPayments', 'goals', 'recurring']) {
      expect(s[k]).toEqual([])
    }
    for (const k of ['contacts', 'budgets', 'shares', 'tgLog', 'catRules']) expect(s[k]).toEqual({})
    expect(s.receipts).toBeUndefined()
    expect(s.settings).toEqual({})
  })

  it('aceita o formato antigo (lista de dívidas)', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify([debt('a')]))
    expect(buildSnapshot().debts).toHaveLength(1)
  })
})

describe('applySnapshot', () => {
  it('grava as duas chaves, preserva campos desconhecidos e soma as configurações às locais', () => {
    ls.setItem(SETTINGS_KEY, JSON.stringify({ currency: 'BRL', soAqui: true }))
    const ok = applySnapshot({
      app: 'BarnaBank', version: 2, exportedAt: 'x', receipts: { r: 1 },
      debts: [debt('a')], budgets: { Mercado: 500 }, shares: { tok: { type: 'person' } },
      settings: { currency: 'USD' },
    })
    expect(ok).toBe(true)
    const data = JSON.parse(ls.getItem(STORAGE_KEY)!)
    expect(data.debts[0]).toMatchObject({ id: 'a', discount: 0, installments: 1 })
    expect(data.budgets).toEqual({ Mercado: 500 })
    expect(data.shares).toEqual({ tok: { type: 'person' } })
    expect(data.app).toBeUndefined()
    expect(data.receipts).toBeUndefined()
    expect(JSON.parse(ls.getItem(SETTINGS_KEY)!)).toEqual({ currency: 'USD', soAqui: true })
    expect(events).toContain('bbweb:store')
  })

  it('guarda uma cópia do que havia antes (só a mais recente)', () => {
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt('velho')] }))
    ls.setItem(SETTINGS_KEY, JSON.stringify({ currency: 'EUR' }))
    applySnapshot({ debts: [debt('novo1')] }, new Date('2026-10-23T10:00:00Z'))
    applySnapshot({ debts: [debt('novo2')] }, new Date('2026-10-23T11:00:00Z'))
    const prev = readBackupPrev()!
    expect(prev.at).toBe('2026-10-23T11:00:00.000Z')
    expect(JSON.parse(prev.data!).debts[0].id).toBe('novo1')
    expect(ls.getItem(BACKUP_PREV_KEY)).toBeTruthy()
  })

  it('não cria cópia quando não havia nada', () => {
    applySnapshot({ debts: [debt('a')] })
    expect(ls.getItem(BACKUP_PREV_KEY)).toBeNull()
  })

  it('recusa o que não é um objeto, sem tocar nos dados', () => {
    ls.setItem(STORAGE_KEY, '{"debts":[]}')
    expect(applySnapshot(null)).toBe(false)
    expect(applySnapshot([1])).toBe(false)
    expect(applySnapshot('x')).toBe(false)
    expect(ls.getItem(STORAGE_KEY)).toBe('{"debts":[]}')
  })

  it('se não der para gravar, volta ao que havia', () => {
    ls.setItem(STORAGE_KEY, '{"debts":[]}')
    let n = 0
    const real = ls.setItem.bind(ls)
    ls.setItem = (k: string, v: string) => {
      n++
      if (n === 2) throw new Error('cheio') // 1 = cópia, 2 = dados
      real(k, v)
    }
    expect(applySnapshot({ debts: [debt('a')] })).toBe(false)
    expect(ls.getItem(STORAGE_KEY)).toBe('{"debts":[]}')
  })
})

describe('utilidades', () => {
  it('isLocalEmpty segue o appIsEmpty do antigo', () => {
    expect(isLocalEmpty()).toBe(true)
    ls.setItem(STORAGE_KEY, JSON.stringify({ debts: [] }))
    expect(isLocalEmpty()).toBe(true)
    ls.setItem(STORAGE_KEY, JSON.stringify({ goals: [{ id: 'g' }] }))
    expect(isLocalEmpty()).toBe(false)
    ls.setItem(STORAGE_KEY, 'lixo')
    expect(isLocalEmpty()).toBe(true)
  })

  it('snapshotHasData', () => {
    expect(snapshotHasData(null)).toBe(false)
    expect(snapshotHasData({})).toBe(false)
    expect(snapshotHasData({ debts: [] })).toBe(true)
    expect(snapshotHasData({ settings: {} })).toBe(true)
  })

  it('hash é estável e muda com o texto', () => {
    expect(hashStr('abc')).toBe(hashStr('abc'))
    expect(hashStr('abc')).not.toBe(hashStr('abd'))
    ls.setItem(STORAGE_KEY, 'a')
    const h = localHash()
    ls.setItem(STORAGE_KEY, 'b')
    expect(localHash()).not.toBe(h)
  })
})
