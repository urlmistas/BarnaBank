import { describe, expect, it } from 'vitest'
import type { AppData, Debt } from '@/lib/types'
import { emptyData } from '@/lib/storage'
import { buildDemoData } from '@/lib/demo-data'
import {
  balanceReport, cardsReport, categoryRanking, chartMonths, clampAnchor, flowSeries, loansByPerson, mixSeries, monthIncome,
  monthSpending, monthsBetween, pctChange, periodBounds, periodIncome, periodMonths, periodSpending, periodSummary,
  previousMonths, reportRange, stepAnchor,
} from './reports'

const data = (p: Partial<AppData>): AppData => ({ ...emptyData(), ...p })
const today = '2026-03-15'
const debt = (p: Partial<Debt>): Debt => ({
  id: 'x', name: 'Fulano', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto',
  installments: 1, days: 30, date: '2026-01-10', dueDay: 10, payments: [], discount: 0,
  lateFeePct: 0, lateInterestPct: 0, notes: '', ...p,
})

const dt = data({
  wallets: [{ id: 'a', name: 'Conta', icon: 'landmark' }, { id: 'b', name: 'Bolso', icon: 'banknote' }],
  transactions: [
    { id: '1', walletId: 'a', type: 'entrada', amount: 1000, date: '2026-02-05', category: 'Salário' },
    { id: '2', walletId: 'a', type: 'entrada', amount: 1000, date: '2026-03-05', category: 'salario' },
    { id: '3', walletId: 'b', type: 'entrada', amount: 50, date: '2026-03-06' },
    { id: '4', walletId: 'a', type: 'gasto', amount: 200, date: '2026-03-02', category: 'Mercado' },
    { id: '5', walletId: 'a', type: 'gasto', amount: 40, date: '2026-03-03', category: ' mércado ' },
    { id: '6', walletId: 'a', type: 'gasto', amount: 30, date: '2026-03-04' },
    // gerados ao pagar conta fixa e fatura: não contam de novo
    { id: 'luz-tx', walletId: 'a', type: 'gasto', amount: 95, date: '2026-03-08', category: 'Casa', auto: 'bill:luz:2026-03' },
    { id: 'fat-tx', walletId: 'a', type: 'gasto', amount: 100, date: '2026-03-12', category: 'Cartão de crédito', auto: 'card:x1' },
    { id: '7', walletId: 'a', type: 'transferencia', toWalletId: 'b', amount: 300, date: '2026-03-02' },
    { id: '8', walletId: 'a', type: 'gasto', amount: 120, date: '2026-02-10', category: 'Mercado' },
  ],
  bills: [
    { id: 'luz', name: 'Luz', amount: 90, kind: 'gasto', dueDay: 10, paid: { '2026-03': 'luz-tx', '2026-02': 'x' }, category: 'Casa' },
    { id: 'net', name: 'Internet', amount: 120, kind: 'gasto', dueDay: 12, paid: {} },
    { id: 'sal', name: 'Salário', amount: 5000, kind: 'entrada', dueDay: 5, paid: { '2026-03': 'x' } },
  ],
  cards: [{ id: 'c', name: 'Roxo', closingDay: 5, dueDay: 12, limit: 1000 }],
  cardPurchases: [
    { id: 'p1', cardId: 'c', amount: 100, date: '2026-01-20', installments: 3, category: 'Lazer' },
    { id: 'p2', cardId: 'c', amount: 60, date: '2026-03-04' },
  ],
  cardPayments: [{ id: 'x1', cardId: 'c', amount: 33.34, invoice: '2026-02', date: '2026-02-11' }],
  debts: [
    debt({ id: 'd1', name: 'Ana', payments: [{ date: '2026-03-10', amount: 100 }, { date: '2026-02-10', amount: 50 }] }),
    debt({ id: 'd2', name: ' ana ', payments: [{ date: '2026-03-11', amount: 20 }] }),
    debt({ id: 'd3', name: 'Oficina', kind: 'payable', payments: [{ date: '2026-03-01', amount: 300 }] }),
  ],
})

describe('relatórios: períodos', () => {
  it('mês, 3 meses, 12 meses e ano (corrente: até hoje)', () => {
    expect(periodMonths('mes', '2026-03', today)).toEqual(['2026-03'])
    expect(periodMonths('3m', '2026-03', today)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(periodMonths('12m', '2026-03', today)).toHaveLength(12)
    expect(periodMonths('12m', '2026-03', today)[0]).toBe('2025-04')
    expect(periodMonths('ano', '2026-12', today)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(periodMonths('ano', '2025-03', today)).toEqual(monthsBetween('2025-01', '2025-12'))
  })
  it('período anterior do mesmo tamanho; ano compara os mesmos meses do ano anterior', () => {
    expect(previousMonths('mes', ['2026-01'])).toEqual(['2025-12'])
    expect(previousMonths('3m', ['2026-01', '2026-02', '2026-03'])).toEqual(['2025-10', '2025-11', '2025-12'])
    expect(previousMonths('ano', ['2026-01', '2026-02', '2026-03'])).toEqual(['2025-01', '2025-02', '2025-03'])
  })
  it('intervalo: do primeiro dado até hoje, sem transferências; null sem dados', () => {
    expect(reportRange(dt, today)).toEqual({ min: '2026-01', max: '2026-03', last: '2026-03' })
    expect(reportRange(emptyData(), today)).toBeNull()
    const future = data({ transactions: [{ id: 't', walletId: 'a', type: 'gasto', amount: 1, date: '2026-09-01' }] })
    expect(reportRange(future, today)).toEqual({ min: '2026-03', max: '2026-03', last: '2026-03' })
    const old = data({ transactions: [{ id: 't', walletId: 'a', type: 'gasto', amount: 1, date: '2025-06-01' }] })
    expect(reportRange(old, today)).toEqual({ min: '2025-06', max: '2026-03', last: '2025-06' })
  })
  it('navegação pula o período inteiro e para nas pontas', () => {
    const r = { min: '2025-02', max: '2026-03' }
    expect(stepAnchor('mes', '2026-03', 1, r)).toBeNull()
    expect(stepAnchor('mes', '2026-03', -1, r)).toBe('2026-02')
    expect(stepAnchor('3m', '2026-03', -1, r)).toBe('2025-12')
    expect(stepAnchor('12m', '2026-03', -1, r)).toBe('2025-03')
    expect(stepAnchor('12m', '2025-03', -1, r)).toBeNull()
    expect(stepAnchor('ano', '2026-03', -1, r)).toBe('2025-12')
    expect(stepAnchor('ano', '2025-12', 1, r)).toBe('2026-03')
    expect(stepAnchor('ano', '2025-12', -1, r)).toBeNull()
  })
  it('âncora fora do intervalo é trazida para dentro', () => {
    const r = { min: '2025-02', max: '2026-03' }
    expect(clampAnchor('mes', '2030-01', r)).toBe('2026-03')
    expect(clampAnchor('3m', '2020-01', r)).toBe('2025-02')
    expect(clampAnchor('ano', '2026-01', r)).toBe('2026-03')
    expect(clampAnchor('ano', '2019-05', r)).toBe('2025-12')
  })
  it('gráfico de barras completa até 6 meses para trás, sem passar do primeiro dado', () => {
    expect(chartMonths(['2026-03'], { min: '2025-01', max: '2026-03' }).map((m) => m.key)).toEqual(monthsBetween('2025-10', '2026-03'))
    const c = chartMonths(['2026-03'], { min: '2026-01', max: '2026-03' })
    expect(c).toEqual([{ key: '2026-01', inPeriod: false }, { key: '2026-02', inPeriod: false }, { key: '2026-03', inPeriod: true }])
  })
  it('limites do período não passam de hoje', () => {
    expect(periodBounds(['2026-02', '2026-03'], today)).toEqual({ from: '2026-02-01', to: '2026-03-15' })
    expect(periodBounds(['2026-01'], today)).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(periodBounds(['2026-04'], today)).toBeNull()
  })
})

describe('relatórios: gastos e entradas (monthSpending)', () => {
  const s = monthSpending(dt, '2026-03')
  it('lançamentos + conta fixa paga (valor lançado) + parcela do cartão; sem contar fatura/conta duas vezes', () => {
    // outros 200+40+30, conta 95, cartão 33,33 (p1 3/3) + 60 (p2)
    expect(s).toMatchObject({ other: 270, bills: 95, card: 93.33, total: 458.33 })
  })
  it('categoria sem acento/maiúscula se junta; vazia vira "Outros"; cartão sem categoria vira "Cartão de crédito"', () => {
    expect(s.byCat.mercado).toEqual({ name: 'Mercado', amount: 240, card: 0 })
    expect(s.byCat.outros.amount).toBe(30)
    expect(s.byCat['cartao de credito']).toEqual({ name: 'Cartão de crédito', amount: 60, card: 60 })
    expect(s.byCat.lazer).toEqual({ name: 'Lazer', amount: 33.33, card: 33.33 })
  })
  it('conta marcada sem carteira usa o valor cadastrado; receita fixa e conta não paga ficam fora', () => {
    const feb = monthSpending(dt, '2026-02')
    expect(feb.bills).toBe(90)
    expect(feb.byCat.casa.amount).toBe(90)
    expect(feb.card).toBe(33.33)
  })
  it('parcela cai no mês da compra + n (não no da fatura)', () => {
    expect(monthSpending(dt, '2026-01').card).toBe(33.34)
    expect(monthSpending(dt, '2026-04').card).toBe(0)
  })
  it('entradas: só lançamentos de entrada, juntando categorias', () => {
    const i = monthIncome(dt, '2026-03')
    expect(i.total).toBe(1050)
    expect(i.byCat.salario).toEqual({ name: 'salario', amount: 1000, card: 0 })
    expect(i.byCat.outros.amount).toBe(50)
  })
  it('valor não numérico é ignorado (não vira NaN)', () => {
    const bad = data({ transactions: [{ id: 'z', walletId: 'a', type: 'gasto', amount: 'x' as unknown as number, date: '2026-03-01' }] })
    expect(monthSpending(bad, '2026-03').total).toBe(0)
  })
  it('período soma os meses e as medidas batem', () => {
    const months = ['2026-02', '2026-03']
    expect(periodSpending(dt, months).byCat.mercado.amount).toBe(360)
    expect(periodIncome(dt, months).byCat.salario.name).toBe('Salário')
    expect(periodSummary(dt, months)).toEqual({ income: 2050, spending: round(458.33 + 120 + 90 + 33.33), net: round(2050 - 701.66) })
  })
})
const round = (v: number) => Math.round(v * 100) / 100

describe('relatórios: ranking e variação', () => {
  it('ordena por valor, mostra a fatia e a diferença para o período anterior', () => {
    const rows = categoryRanking(monthSpending(dt, '2026-03'), monthSpending(dt, '2026-02'))
    expect(rows[0]).toMatchObject({ key: 'mercado', amount: 240, prev: 120, diff: 120 })
    expect(rows[0].share).toBeCloseTo(240 / 458.33)
    expect(rows.find((r) => r.key === 'casa')).toMatchObject({ prev: 90, diff: 5 })
    expect(rows.find((r) => r.key === 'outros')).toMatchObject({ prev: 0, diff: 30 })
  })
  it('variação relativa; null sem base', () => {
    expect(pctChange(150, 100)).toBeCloseTo(0.5)
    expect(pctChange(-50, -100)).toBeCloseTo(0.5)
    expect(pctChange(10, 0)).toBeNull()
  })
})

describe('relatórios: séries', () => {
  const months = [{ key: '2026-02', inPeriod: false }, { key: '2026-03', inPeriod: true }]
  it('fluxo entrou × saiu por mês', () => {
    expect(flowSeries(dt, months)).toEqual([
      { key: '2026-02', inPeriod: false, income: 1000, spending: 243.33, net: 756.67 },
      { key: '2026-03', inPeriod: true, income: 1050, spending: 458.33, net: 591.67 },
    ])
  })
  it('contas fixas × cartão × outros', () => {
    expect(mixSeries(dt, months)[1]).toEqual({ key: '2026-03', inPeriod: true, bills: 95, card: 93.33, other: 270, total: 458.33 })
  })
  it('saldo total dia a dia e cada carteira no início e no fim', () => {
    const r = balanceReport(dt, ['2026-03'], today)
    expect(r.points).toHaveLength(15)
    expect(r.points[0].date).toBe('2026-03-01')
    const a = r.wallets.find((w) => w.id === 'a')!
    // fev: +1000 −120 = 880; mar até 15: +1000 −200 −40 −30 −95 −100 −300 = 235 → 1115
    expect(a).toMatchObject({ start: 880, end: 1115, change: 235 })
    expect(r.wallets.find((w) => w.id === 'b')).toMatchObject({ start: 0, end: 350 })
    expect(r.points[r.points.length - 1].total).toBe(1465)
  })
  it('sem carteiras: série vazia', () => {
    expect(balanceReport(data({}), ['2026-03'], today)).toEqual({ points: [], wallets: [] })
  })
})

describe('relatórios: empréstimos e cartões', () => {
  it('recebido e pago por pessoa no período (nome agrupado como em Pessoas)', () => {
    const r = loansByPerson(dt, ['2026-03'])
    expect(r).toEqual({
      rows: [
        { key: 'oficina', name: 'Oficina', received: 0, paid: 300 },
        { key: 'ana', name: 'Ana', received: 120, paid: 0 },
      ],
      received: 120,
      paid: 300,
    })
    expect(loansByPerson(dt, ['2026-02']).received).toBe(50)
  })
  it('cartão: compras nas faturas do período, pagamentos e fatura do último mês', () => {
    const months = ['2026-02', '2026-03']
    const r = cardsReport(dt, months, chartMonths(months, { min: '2026-01', max: '2026-03' }), today)
    // p1 (20/01, fecha dia 5) → faturas fev/mar/abr; p2 (04/03) → mar
    expect(r.rows[0]).toMatchObject({ id: 'c', charges: round(33.34 + 33.33 + 60), paid: 33.34, lastKey: '2026-03', used: round(160 - 33.34), limit: 1000 })
    expect(r.rows[0].lastStatus).toBe('atrasada')
    expect(r.series).toEqual([
      { key: '2026-01', inPeriod: false, charges: 0 },
      { key: '2026-02', inPeriod: true, charges: 33.34 },
      { key: '2026-03', inPeriod: true, charges: 93.33 },
    ])
  })
})

describe('relatórios: demonstração', () => {
  it('tem dados em vários meses e não conta o aluguel duas vezes', () => {
    const t = '2026-10-23'
    const demo = buildDemoData(t)
    const r = reportRange(demo, t)!
    expect(r.max).toBe('2026-10')
    expect(r.min <= '2025-11').toBe(true)
    const s = monthSpending(demo, '2026-10')
    // t2 é o lançamento gerado pela conta fixa Aluguel (auto 'bill:'): entra só pela conta
    expect(s.bills).toBe(1850)
    expect(demo.transactions.filter((x) => x.auto?.startsWith('bill:b3:'))).toHaveLength(1)
  })
})
