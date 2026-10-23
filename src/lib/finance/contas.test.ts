import { describe, expect, it } from 'vitest'
import type { AppData, Bill } from '@/lib/types'
import { emptyData } from '@/lib/storage'
import { buildDemoData } from '@/lib/demo-data'
import {
  billDetail, billRow, billTx, cardDetail, contaCounts, contasMonthRange, contasRows, contasTotals, filterContas,
  matchesConta, parseRouteId, purchaseLabel,
} from './contas'

const data = (p: Partial<AppData>): AppData => ({ ...emptyData(), ...p })
const today = '2026-03-15'
const bill = (p: Partial<Bill>): Bill => ({ id: 'b', name: 'Luz', amount: 90, kind: 'gasto', dueDay: 10, paid: {}, ...p })

const dt = data({
  wallets: [{ id: 'w', name: 'Conta', icon: 'landmark' }],
  transactions: [{ id: 't1', walletId: 'w', type: 'gasto', amount: 95.5, date: '2026-03-08' }],
  bills: [
    bill({ id: 'luz', name: 'Luz', dueDay: 10, paid: { '2026-03': 't1', '2026-01': 'x' }, startMonth: '2026-01', category: 'Casa' }),
    bill({ id: 'net', name: 'Internet', amount: 120, dueDay: 12 }),
    bill({ id: 'agua', name: 'Água', amount: 60, dueDay: 15 }),
    bill({ id: 'gym', name: 'Academia', amount: 99, dueDay: 31 }),
    bill({ id: 'sal', name: 'Salário', amount: 5000, kind: 'entrada', dueDay: 5 }),
    bill({ id: 'old', name: 'Streaming', amount: 30, dueDay: 1, endMonth: '2026-02' }),
    bill({ id: 'off', name: 'Clube', amount: 50, dueDay: 2, active: false, paid: { '2026-01': 'x' } }),
  ],
  cards: [{ id: 'c', name: 'Roxo', closingDay: 5, dueDay: 12, limit: 1000, walletId: 'w' }],
  cardPurchases: [
    { id: 'p1', cardId: 'c', amount: 300, date: '2026-01-20', installments: 3, desc: 'Tênis' },
    { id: 'p2', cardId: 'c', amount: 90, date: '2026-03-04', category: 'Mercado' },
  ],
  cardPayments: [{ id: 'x1', cardId: 'c', amount: 60, invoice: '2026-02', date: '2026-02-11' }],
})

describe('contas: linhas do mês', () => {
  const rows = contasRows(dt, '2026-03', today)
  const by = (id: string) => rows.find((r) => r.id === id)!

  it('uma linha por conta vigente e uma por cartão, por vencimento', () => {
    expect(rows.map((r) => r.id)).toEqual(['fixa-sal', 'fixa-luz', 'fixa-net', 'cartao-c', 'fixa-agua', 'fixa-gym'])
  })
  it('status: paga / atrasada / vence hoje / pendente', () => {
    expect(by('fixa-luz').status).toBe('paga')
    expect(by('fixa-net')).toMatchObject({ status: 'atrasada', diff: -3 })
    expect(by('fixa-agua')).toMatchObject({ status: 'hoje', diff: 0 })
    expect(by('fixa-gym')).toMatchObject({ status: 'pendente', due: '2026-03-31' })
  })
  it('conta paga usa o valor e a data da transação lançada (billTxOf)', () => {
    expect(by('fixa-luz')).toMatchObject({ amount: 95.5, paid: 95.5, open: 0, paidDate: '2026-03-08', walletId: 'w' })
    expect(billTx(dt.bills[0], '2026-01', dt.transactions)).toBeUndefined() // 'x' = sem carteira
    expect(billRow(dt.bills[0], '2026-01', dt, today)).toMatchObject({ status: 'paga', amount: 90, paidDate: undefined })
  })
  it('fatura: saldo da anterior não pago até o vencimento entra nesta e a deixa atrasada', () => {
    // p1 (20/01, fecha dia 5) começa na fatura de fev: fev 100 − 60 pago → 40 rolam para mar (100 + 90 + 40)
    const c = by('cartao-c')
    expect(c).toMatchObject({ kind: 'fatura', name: 'Roxo', due: '2026-03-12', carry: 40, amount: 230, open: 230, status: 'atrasada' })
    const feb = contasRows(dt, '2026-02', today).find((r) => r.id === 'cartao-c')!
    expect(feb).toMatchObject({ amount: 100, paid: 60, open: 40, rolled: 40, status: 'atrasada' })
  })
  it('receita fixa fica na lista, fora das medidas', () => {
    expect(by('fixa-sal')).toMatchObject({ income: true, status: 'atrasada' })
    const t = contasTotals(rows)
    expect(t).toEqual({ toPay: 120 + 60 + 99 + 230, paid: 95.5, late: 120 + 230, income: 5000, incomeOpen: 5000 })
  })
  it('fim de vigência e conta inativa somem do mês', () => {
    expect(contasRows(dt, '2026-02', today).some((r) => r.id === 'fixa-old')).toBe(true)
    expect(rows.some((r) => r.id === 'fixa-old' || r.id === 'fixa-off')).toBe(false)
  })
  it('cartão sem compras no mês aparece como "vazia", só em Todas', () => {
    const r = contasRows(data({ cards: dt.cards }), '2026-03', today)[0]
    expect(r).toMatchObject({ status: 'vazia', amount: 0, open: 0 })
    expect(matchesConta(r, 'todas')).toBe(true)
    expect(matchesConta(r, 'pendentes') || matchesConta(r, 'pagas')).toBe(false)
  })
})

describe('contas: filtro e busca', () => {
  const rows = contasRows(dt, '2026-03', today)
  it('pendentes inclui atrasadas; pagas e atrasadas separadas', () => {
    expect(contaCounts(rows, '')).toEqual({ todas: 6, pendentes: 5, pagas: 1, atrasadas: 3 })
  })
  it('busca sem acento no nome e na categoria; "fatura" acha cartões', () => {
    expect(filterContas(rows, 'todas', 'agua').map((r) => r.id)).toEqual(['fixa-agua'])
    expect(filterContas(rows, 'todas', 'casa').map((r) => r.id)).toEqual(['fixa-luz'])
    expect(filterContas(rows, 'todas', 'fatura').map((r) => r.id)).toEqual(['cartao-c'])
    expect(filterContas(rows, 'pagas', 'net')).toEqual([])
  })
  it('rota', () => {
    expect(parseRouteId('fixa-a-b')).toEqual({ kind: 'fixa', refId: 'a-b' })
    expect(parseRouteId('cartao-c')).toEqual({ kind: 'fatura', refId: 'c' })
    expect(parseRouteId('fixa-')).toBeNull()
    expect(parseRouteId('xyz')).toBeNull()
  })
})

describe('contas: meses', () => {
  it('do primeiro dado até 12 meses à frente', () => {
    expect(contasMonthRange(dt, today)).toEqual({ min: '2026-01', max: '2027-03' })
    expect(contasMonthRange(emptyData(), today)).toEqual({ min: '2026-03', max: '2027-03' })
  })
})

describe('contas: detalhe da conta fixa', () => {
  it('histórico do início até hoje, mais recente primeiro', () => {
    const d = billDetail(dt, 'luz', '2026-03', today)!
    expect(d.months.map((m) => [m.key, m.row.status])).toEqual([
      ['2026-03', 'paga'], ['2026-02', 'atrasada'], ['2026-01', 'paga'],
    ])
    expect(d).toMatchObject({ paidCount: 2, paidTotal: 185.5 })
  })
  it('vai até o mês aberto se ele for futuro; respeita o fim da vigência', () => {
    expect(billDetail(dt, 'luz', '2026-05', today)!.months[0].key).toBe('2026-05')
    expect(billDetail(dt, 'old', '2026-03', today)!.months[0].key).toBe('2026-02')
  })
  it('sem início: 12 meses; inativa: só os meses pagos', () => {
    expect(billDetail(dt, 'net', '2026-03', today)!.months).toHaveLength(12)
    expect(billDetail(dt, 'off', '2026-03', today)!.months.map((m) => m.key)).toEqual(['2026-01'])
    expect(billDetail(dt, 'nada', '2026-03', today)).toBeNull()
  })
})

describe('contas: detalhe da fatura', () => {
  it('compras com parcela, limite e histórico', () => {
    const d = cardDetail(dt, 'c', '2026-03', today)!
    expect(d.items.map((i) => [i.label, i.i, i.n, i.value])).toEqual([['Mercado', 1, 1, 90], ['Tênis', 2, 3, 100]])
    expect(d).toMatchObject({ used: 330, limit: 1000, available: 670 })
    expect(d.usedPct).toBeCloseTo(33)
    expect(d.history.map((h) => [h.key, h.row.status])).toEqual([['2026-04', 'pendente'], ['2026-03', 'atrasada'], ['2026-02', 'atrasada']])
    expect(cardDetail(dt, 'zz', '2026-03', today)).toBeNull()
  })
  it('descrição da compra: desc, nota, categoria ou "Compra"', () => {
    expect(purchaseLabel({ id: '1', cardId: 'c', amount: 1, date: today })).toBe('Compra')
    expect(purchaseLabel({ id: '1', cardId: 'c', amount: 1, date: today, desc: '  ' , category: 'X' })).toBe('X')
  })
  it('demonstração tem paga, atrasada e pendente', () => {
    const t = '2026-10-23'
    const rows = contasRows(buildDemoData(t), '2026-10', t)
    const st = new Set(rows.map((r) => r.status))
    expect(st.has('paga') && st.has('atrasada') && st.has('pendente')).toBe(true)
    expect(cardDetail(buildDemoData(t), 'c1', '2026-09', t)!.row.status).toBe('paga')
  })
})
