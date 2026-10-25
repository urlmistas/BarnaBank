import { describe, expect, it } from 'vitest'
import type { AppData } from '@/lib/types'
import { monthSummary } from './month-image'

const data: AppData = {
  debts: [
    { id: 'd1', name: 'Ana', kind: 'receivable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30, date: '2026-01-01', dueDay: 1,
      payments: [{ date: '2026-03-05', amount: 40, mode: 'fifo' }, { date: '2026-02-05', amount: 10, mode: 'fifo' }], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '' },
    { id: 'd2', name: 'Loja', kind: 'payable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30, date: '2026-01-01', dueDay: 1,
      payments: [{ date: '2026-03-07', amount: 25, mode: 'fifo' }], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '' },
  ],
  contacts: {}, wallets: [{ id: 'w1', name: 'Nubank' }], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [],
  transactions: [
    { id: 't1', walletId: 'w1', type: 'entrada', amount: 1000, date: '2026-03-02', category: 'Salário' },
    { id: 't2', walletId: 'w1', type: 'gasto', amount: 300, date: '2026-03-03', category: 'Mercado' },
    { id: 't3', walletId: 'w1', type: 'gasto', amount: 100, date: '2026-03-04', category: 'Lazer' },
    { id: 't4', walletId: 'w1', type: 'gasto', amount: 999, date: '2026-02-04', category: 'Outro mês' },
  ],
  budgets: { Mercado: 250 },
  goals: [{ id: 'g1', name: 'Viagem', target: 1000, deadline: '', walletId: '', adds: [{ date: '2026-03-01', amount: 200 }] }],
}

describe('monthSummary', () => {
  it('soma só o mês pedido', () => {
    const s = monthSummary(data, '2026-03', '2026-03-15')
    expect(s).toMatchObject({ title: 'março 2026', income: 1000, spending: 400, balance: 600, other: 400, loanIn: 40, loanOut: 25 })
    expect(s.cats.map((c) => c.name)).toEqual(['Mercado', 'Lazer'])
    expect(s.budgets[0]).toMatchObject({ name: 'Mercado', spent: 300, cls: 'over' })
    expect(s.goals).toEqual([{ name: 'Viagem', saved: 200, target: 1000, pct: 20 }])
  })

  it('mês sem nada', () => {
    const s = monthSummary(data, '2025-01', '2026-03-15')
    expect(s).toMatchObject({ income: 0, spending: 0, balance: 0, cats: [] })
  })
})
