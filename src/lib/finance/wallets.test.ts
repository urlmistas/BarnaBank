import { describe, expect, it } from 'vitest'
import type { AppData, Debt } from '@/lib/types'
import { emptyData, parseAppData, walletIconKey } from '@/lib/storage'
import { buildDemoData } from '@/lib/demo-data'
import { cardUsed } from './bills-cards'
import {
  balanceSeries, buildWalletRows, clampMonth, matchesMovement, stepMonth, totalWalletsBalance, walletCards,
  walletEvents, walletKindLabel, walletMonth, walletMonthRange, walletSeries,
} from './wallets'

const base = (p: Partial<Debt>): Debt => ({
  id: 'x', name: 'Fulano', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto',
  installments: 3, days: 90, date: '2026-01-10', dueDay: 10, payments: [], discount: 0,
  lateFeePct: 0, lateInterestPct: 0, notes: '', ...p,
})
const data = (p: Partial<AppData>): AppData => ({ ...emptyData(), ...p })
const today = '2026-03-15'

const dt = data({
  wallets: [{ id: 'a', name: 'Conta', icon: 'landmark' }, { id: 'b', name: 'Bolso', icon: 'banknote' }],
  transactions: [
    { id: '1', walletId: 'a', type: 'entrada', amount: 1000, date: '2026-02-05', category: 'Salário' },
    { id: '2', walletId: 'a', type: 'gasto', amount: 200, date: '2026-03-02', note: 'feira' },
    { id: '3', walletId: 'a', type: 'transferencia', toWalletId: 'b', amount: 300, date: '2026-03-02' },
    { id: '4', walletId: 'a', type: 'gasto', amount: 50, date: '2026-03-10', category: 'Mercado' },
    { id: '5', walletId: 'a', type: 'transferencia', toWalletId: 'zz', amount: 10, date: '2026-03-11' },
  ],
  debts: [base({ id: 'd', name: 'Ana', payments: [{ date: '2026-03-10', amount: 100, walletId: 'a', note: 'pix' }] })],
  cards: [
    { id: 'c', name: 'Roxo', closingDay: 5, dueDay: 12, limit: 1000, walletId: 'a' },
    { id: 'c2', name: 'Sem conta', closingDay: 5, dueDay: 12, limit: 0 },
  ],
  cardPurchases: [
    { id: 'p1', cardId: 'c', amount: 300, date: '2026-02-20', installments: 3 },
    { id: 'p2', cardId: 'c', amount: 90, date: '2026-03-07' },
  ],
  cardPayments: [{ id: 'x1', cardId: 'c', amount: 40, invoice: '2026-03', date: '2026-03-09' }],
})

describe('carteiras: eventos', () => {
  it('chave única por lado da transferência e por pagamento; nota e rótulo como o antigo', () => {
    const ev = walletEvents(dt, 'a')
    expect(new Set(ev.map((e) => e.key)).size).toBe(ev.length)
    expect(ev.find((e) => e.key === 't:3:out')!.label).toBe('Transferência para Bolso')
    expect(ev.find((e) => e.key === 't:5:out')!.label).toBe('Transferência para carteira excluída')
    expect(ev.find((e) => e.key === 't:2')!).toMatchObject({ label: 'Gasto', note: 'feira', category: undefined })
    expect(ev.find((e) => e.key === 'p:d:0')!).toMatchObject({ label: 'Recebido de Ana', note: 'pix', isLoan: true })
    expect(walletEvents(dt, 'b')[0]).toMatchObject({ key: 't:3:in', label: 'Transferência de Conta', kind: 'entrada' })
  })
  it('filtro de tipo separa transferências de entradas e saídas', () => {
    const ev = walletEvents(dt, 'a')
    expect(ev.filter((e) => matchesMovement(e, 'transferencias')).map((e) => e.key)).toEqual(['t:5:out', 't:3:out'])
    expect(ev.filter((e) => matchesMovement(e, 'saidas')).map((e) => e.key).sort()).toEqual(['t:2', 't:4'])
    expect(ev.filter((e) => matchesMovement(e, 'entradas')).map((e) => e.key).sort()).toEqual(['p:d:0', 't:1'])
    expect(ev.filter((e) => matchesMovement(e, 'todos'))).toHaveLength(ev.length)
  })
})

describe('carteiras: mês agrupado por dia', () => {
  const ev = walletEvents(dt, 'a')
  it('dias do mais recente ao mais antigo, com saldo ao fim do dia', () => {
    const m = walletMonth(ev, '2026-03', 'todos', today)
    expect(m.days.map((d) => d.date)).toEqual(['2026-03-11', '2026-03-10', '2026-03-02'])
    // 1000 − 200 − 300 = 500 em 02/03; −50 +100 = 550 em 10/03; −10 = 540 em 11/03
    expect(m.days.map((d) => d.endBalance)).toEqual([540, 550, 500])
    expect(m.monthIn).toBe(100)
    expect(m.monthOut).toBe(250) // transferências não contam
    expect(m.total).toBe(5)
    expect(m.shown).toBe(5)
  })
  it('o filtro não muda o saldo do dia; mês sem nada aponta o último mês com movimento', () => {
    const m = walletMonth(ev, '2026-03', 'saidas', today)
    expect(m.days.map((d) => [d.date, d.endBalance])).toEqual([['2026-03-10', 550], ['2026-03-02', 500]])
    const jan = walletMonth(ev, '2026-01', 'entradas', today)
    expect(jan.shown).toBe(0)
    expect(jan.latestWith).toBe('2026-03')
    expect(walletMonth(ev, '2026-01', 'transferencias', today).latestWith).toBe('2026-03')
    expect(walletMonth([], '2026-03', 'todos', today).latestWith).toBeUndefined()
  })
  it('intervalo de meses vai do primeiro movimento até hoje', () => {
    const r = walletMonthRange(ev, today)
    expect(r).toEqual({ min: '2026-02', max: '2026-03' })
    expect(walletMonthRange([], today)).toEqual({ min: '2026-03', max: '2026-03' })
    expect(clampMonth('2025-12', r)).toBe('2026-02')
    expect(clampMonth('2026-09', r)).toBe('2026-03')
    expect(stepMonth('2026-02', -1, r)).toBeNull()
    expect(stepMonth('2026-02', 1, r)).toBe('2026-03')
  })
})

describe('carteiras: cartão ligado à carteira', () => {
  it('limite usado = compras − pagamentos (compra parcelada inteira)', () => {
    expect(cardUsed(dt, dt.cards[0])).toBe(350)
    expect(cardUsed({ cardPurchases: [], cardPayments: [{ id: 'y', cardId: 'c', amount: 5, invoice: '2026-01' }] }, dt.cards[0])).toBe(0)
  })
  it('fatura do mês de hoje, vencimento e % do limite; só cartões com walletId da carteira', () => {
    const cs = walletCards(dt, 'a', today)
    expect(cs).toHaveLength(1)
    // fatura de março: parcela 1/3 da compra de 20/02 (fecha 05/03) = 100 + nada mais (07/03 vai para abril)
    expect(cs[0]).toMatchObject({ invoiceKey: '2026-03', invoiceTotal: 100, invoiceBalance: 60, due: '2026-03-12', used: 350, limit: 1000 })
    expect(cs[0].usedPct).toBeCloseTo(35)
    expect(cs[0].invoiceStatus).toBe('atrasada') // 15/03 > vencimento 12/03 com saldo
    expect(walletCards(dt, 'b', today)).toEqual([])
  })
  it('sem limite cadastrado → usedPct null', () => {
    const d2 = { ...dt, cards: [{ ...dt.cards[1], walletId: 'b' }] }
    expect(walletCards(d2, 'b', today)[0].usedPct).toBeNull()
  })
})

describe('carteiras: linhas e gráfico', () => {
  it('uma linha por carteira, na ordem original, com tipo deduzido do ícone', () => {
    const rows = buildWalletRows(dt, today)
    expect(rows.map((r) => [r.wallet.id, r.kind, r.balance, r.count, r.lastDate])).toEqual([
      ['a', 'Banco', 540, 6, '2026-03-11'],
      ['b', 'Dinheiro', 300, 1, '2026-03-02'],
    ])
    expect(rows.reduce((s, r) => s + r.balance, 0)).toBe(totalWalletsBalance(dt))
    expect(walletKindLabel('credit-card')).toBe('Cartão')
    expect(walletKindLabel('gem')).toBe('Carteira')
    expect(walletKindLabel(undefined)).toBe('Carteira')
  })
  it('série de uma carteira só, do primeiro movimento até hoje', () => {
    const s = walletSeries(dt, 'b', today)
    expect(s[0]).toEqual({ date: '2026-03-02', total: 300 })
    expect(s[s.length - 1]).toEqual({ date: today, total: 300 })
    expect(balanceSeries(dt, '2026-03-01', '2026-03-02', 'a').map((p) => p.total)).toEqual([1000, 500])
    expect(walletSeries(data({ wallets: [{ id: 'q', name: 'Q' }] }), 'q', today)).toEqual([])
  })
  it('demonstração: cartão ligado a uma carteira e transferência entre carteiras', () => {
    const demo = buildDemoData(today)
    const rows = buildWalletRows(demo, today)
    expect(rows.some((r) => r.cards.length > 0)).toBe(true)
    expect(rows.some((r) => walletEvents(demo, r.wallet.id).some((e) => e.isTransfer))).toBe(true)
  })
})

describe('storage: carteiras (somente leitura)', () => {
  it('walletIconKey converte emoji antigo e mantém texto livre', () => {
    expect(walletIconKey('💳')).toBe('credit-card')
    expect(walletIconKey('🏦️')).toBe('landmark')
    expect(walletIconKey('')).toBe('wallet')
    expect(walletIconKey('piggy-bank')).toBe('piggy-bank')
    expect(walletIconKey('★')).toBe('★')
  })
  it('normaliza carteiras e o walletId do cartão sem alterar o JSON de origem', () => {
    const src = {
      wallets: [{ id: 'w', name: 'Conta', icon: '🐷' }, { name: 'sem id' }, null, { id: 7, name: 3 }],
      cards: [{ id: 'c', name: 'C', walletId: 'w' }, { id: 'd', name: 'D', walletId: '' }, { id: 'e', name: 'E', walletId: 5 }],
    }
    const raw = JSON.stringify(src)
    const d = parseAppData(raw, today)!
    expect(d.wallets).toEqual([{ id: 'w', name: 'Conta', icon: 'piggy-bank' }, { id: '7', name: '3', icon: 'wallet' }])
    expect(d.cards.map((c) => c.walletId)).toEqual(['w', undefined, undefined])
    expect(JSON.stringify(src)).toBe(raw)
  })
})
