import { describe, expect, it, vi } from 'vitest'
import type { AppData, Debt } from '@/lib/types'
import { addDaysISO, dayIn, toISO, ymAdd } from './dates'
import { computeSchedule, dueDateForInstallment, finalValue, makeDebtCalc, syncRecurringDebt } from './debts'
import { cardInvoices, invoiceDates, invoiceKeyFor, splitEqual } from './bills-cards'
import { monthInOut, totalWalletsBalance, walletBalance } from './wallets'
import { dashboardAlert, dashboardSummary, upcomingItems } from './dashboard'
import { emptyData, loadAppData, parseAppData, STORAGE_KEY } from '@/lib/storage'

const base = (p: Partial<Debt>): Debt => ({
  id: 'x', name: 'Fulano', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto',
  installments: 3, days: 90, date: '2026-01-10', dueDay: 10, payments: [], discount: 0,
  lateFeePct: 0, lateInterestPct: 0, notes: '', ...p,
})
const data = (p: Partial<AppData>): AppData => ({ ...emptyData(), ...p })

describe('datas', () => {
  it('ymAdd atravessa o ano', () => {
    expect(ymAdd('2026-12', 1)).toBe('2027-01')
    expect(ymAdd('2026-01', -1)).toBe('2025-12')
  })
  it('dayIn limita ao fim do mês', () => {
    expect(dayIn('2026-02', 31)).toBe('2026-02-28')
  })
})

describe('juros e vencimentos', () => {
  it('finalValue: composto, simples, price e plano', () => {
    expect(finalValue(base({ principal: 1000, rate: 10, installments: 2 }))).toBeCloseTo(1210, 6)
    expect(finalValue(base({ principal: 1000, rate: 10, installments: 2, interestType: 'simples' }))).toBeCloseTo(1200, 6)
    expect(finalValue(base({ principal: 1000, rate: 0, installments: 2, interestType: 'price' }))).toBe(1000)
    expect(finalValue(base({ principal: 1000, rate: 1, installments: 12, interestType: 'price' }))).toBeCloseTo(1066.19, 2)
    expect(finalValue(base({ plan: [{ v: 10, due: '2026-02-01' }, { v: 15.5, due: '2026-03-01' }] }))).toBe(25.5)
  })
  it('primeira parcela vence um mês depois da data, no dueDay limitado ao mês', () => {
    const d = base({ date: '2026-01-31', dueDay: 31 })
    expect(toISO(dueDateForInstallment(d, 0))).toBe('2026-02-28')
    expect(toISO(dueDateForInstallment(d, 1))).toBe('2026-03-31')
    expect(toISO(dueDateForInstallment(d, 11))).toBe('2027-01-31')
  })
  it('firstDue e dueOverride têm prioridade', () => {
    const d = base({ firstDue: '2026-05-31', dueOverride: { '1': '2026-07-02' } })
    expect(toISO(dueDateForInstallment(d, 0))).toBe('2026-05-31')
    expect(toISO(dueDateForInstallment(d, 1))).toBe('2026-07-02')
    expect(toISO(dueDateForInstallment(d, 2))).toBe('2026-07-31')
  })
})

describe('motor de parcelas', () => {
  it('FIFO: pagamento abate a parcela mais antiga; o excesso vira crédito', () => {
    const s = computeSchedule(base({ payments: [{ date: '2026-02-01', amount: 150 }] }), '2026-02-05')
    expect(s.insts.map((i) => i.state)).toEqual(['paga', 'parcial', 'aberta'])
    expect(s.open).toBe(150)
    const s2 = computeSchedule(base({ payments: [{ date: '2026-02-01', amount: 350 }] }), '2026-02-05')
    expect(s2.open).toBe(0)
    expect(s2.credit).toBe(50)
  })
  it('atraso: parcelas vencidas contam em overdue', () => {
    const s = computeSchedule(base({}), '2026-03-15')
    expect(s.overdueCount).toBe(2)
    expect(s.overdue).toBeCloseTo(200, 6)
    expect(s.firstOpen?.dueISO).toBe('2026-02-10')
  })
  it('multa + juros de mora (pro-rata 30 dias)', () => {
    const d = base({ installments: 1, principal: 100, lateFeePct: 2, lateInterestPct: 3 })
    const s = computeSchedule(d, '2026-03-12') // venceu 10/02, 30 dias depois
    expect(s.open).toBeCloseTo(100 + 2 + 3, 2)
  })
  it('modo target paga a parcela escolhida e adianta as próximas', () => {
    const d = base({ payments: [{ date: '2026-01-20', amount: 100, mode: 'target', target: 1 }] })
    const s = computeSchedule(d, '2026-01-25')
    expect(s.insts.map((i) => i.state)).toEqual(['aberta', 'paga', 'aberta'])
  })
  it('desconto quita o restante', () => {
    const d = base({ installments: 1, principal: 100, payments: [{ date: '2026-02-01', amount: 90 }], discount: 10 })
    const c = makeDebtCalc('2026-03-01')
    expect(c.remaining(d)).toBe(0)
    expect(c.isPaid(d)).toBe(true)
    expect(c.statusOf(d)).toBe('pago')
  })
  it('statusOf: hoje / embreve / emdia / atrasado', () => {
    const d = base({ installments: 1, firstDue: '2026-04-10' })
    expect(makeDebtCalc('2026-04-10').statusOf(d)).toBe('hoje')
    expect(makeDebtCalc('2026-04-03').statusOf(d)).toBe('embreve')
    expect(makeDebtCalc('2026-04-02').statusOf(d)).toBe('emdia')
    expect(makeDebtCalc('2026-04-11').statusOf(d)).toBe('atrasado')
  })
  it('openInMonth: no mês atual soma também os atrasados', () => {
    const d = base({})
    const c = makeDebtCalc('2026-03-05')
    expect(c.openInMonth(d, 2026, 2)).toBeCloseTo(200, 6) // fev atrasada + mar
    expect(c.openInMonth(d, 2026, 3)).toBeCloseTo(100, 6)
  })
  it('amountDueNow: atrasado inteiro, senão a próxima parcela', () => {
    expect(makeDebtCalc('2026-03-15').amountDueNow(base({}))).toBeCloseTo(200, 6)
    expect(makeDebtCalc('2026-01-15').amountDueNow(base({}))).toBeCloseTo(100, 6)
  })
  it('recorrente: mantém sempre a próxima parcela por vencer', () => {
    const d = base({ kind: 'payable', recurring: { amount: 50, label: 'Netflix' }, installments: 1, principal: 50 })
    const r = syncRecurringDebt(d, '2026-04-15') // vencimentos 10/02, 10/03, 10/04 passaram
    expect(r.installments).toBe(4)
    expect(r.principal).toBe(200)
  })
})

describe('cartão e contas fixas', () => {
  it('splitEqual não perde centavos', () => {
    expect(splitEqual(100, 3)).toEqual([33.34, 33.33, 33.33])
  })
  it('compra depois do fechamento vai para a fatura seguinte', () => {
    const card = { id: 'c', name: 'X', closingDay: 5, dueDay: 12, limit: 0 }
    expect(invoiceKeyFor(card, '2026-03-05')).toBe('2026-03')
    expect(invoiceKeyFor(card, '2026-03-06')).toBe('2026-04')
    expect(invoiceDates(card, '2026-03')).toEqual({ close: '2026-03-05', due: '2026-03-12' })
    const card2 = { ...card, closingDay: 25, dueDay: 5 }
    expect(invoiceDates(card2, '2026-03').due).toBe('2026-04-05')
  })
  it('fatura não paga até o vencimento rola para a seguinte', () => {
    const card = { id: 'c', name: 'X', closingDay: 5, dueDay: 12, limit: 0 }
    const inv = cardInvoices({ cardPurchases: [{ id: 'p', cardId: 'c', amount: 100, date: '2026-02-01' }], cardPayments: [] }, card, '2026-03-20')
    expect(inv.get('2026-02').rolled).toBe(100)
    expect(inv.get('2026-03').total).toBe(100)
    expect(inv.get('2026-03').status).toBe('atrasada')
  })
})

describe('carteiras', () => {
  const dt = data({
    wallets: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    transactions: [
      { id: '1', walletId: 'a', type: 'entrada', amount: 1000, date: '2026-03-01' },
      { id: '2', walletId: 'a', type: 'gasto', amount: 200, date: '2026-03-02' },
      { id: '3', walletId: 'a', type: 'transferencia', toWalletId: 'b', amount: 300, date: '2026-03-03' },
      { id: '4', walletId: 'b', type: 'gasto', amount: 50, date: '2026-02-28' },
    ],
    debts: [base({ payments: [{ date: '2026-03-04', amount: 100, walletId: 'b' }, { date: '2026-03-04', amount: 7 }] })],
  })
  it('saldo soma lançamentos, transferências e pagamentos vinculados', () => {
    expect(walletBalance(dt, 'a')).toBe(500)
    expect(walletBalance(dt, 'b')).toBe(350)
    expect(totalWalletsBalance(dt)).toBe(850) // pagamento sem carteira não entra
  })
  it('entrou/saiu no mês ignora transferências e lê data em horário local', () => {
    expect(monthInOut(dt, 2026, 2)).toEqual({ monthIn: 1100, monthOut: 200, net: 900 })
    expect(monthInOut(dt, 2026, 1).monthOut).toBe(50)
  })
})

describe('Início', () => {
  const today = '2026-03-10'
  const dt = data({
    debts: [
      base({ id: 'late', name: 'Atrasado', installments: 1, firstDue: '2026-03-01' }),
      base({ id: 'soon', name: 'Logo', installments: 1, firstDue: '2026-03-17' }),
      base({ id: 'far', name: 'Longe', installments: 1, firstDue: '2026-03-18' }),
      base({ id: 'pay', name: 'Eu devo', kind: 'payable', installments: 1, principal: 80, firstDue: '2026-03-10' }),
    ],
    bills: [{ id: 'b', name: 'Luz', amount: 90, kind: 'gasto', dueDay: 12, paid: {}, startMonth: '2026-03' }],
  })
  it('próximos 7 dias: inclui atrasados e até hoje+7, ordenado por data', () => {
    const items = upcomingItems(dt, today)
    expect(items.map((i) => i.title)).toEqual(['Atrasado', 'Eu devo', 'Luz', 'Logo'])
    expect(items[0]).toMatchObject({ late: true, dir: 'in', amount: 300 })
    expect(items[1]).toMatchObject({ dir: 'out', amount: 80 })
  })
  it('conta fixa do mês anterior não paga aparece como atrasada', () => {
    const items = upcomingItems(data({ bills: [{ id: 'b', name: 'Luz', amount: 90, kind: 'gasto', dueDay: 5, paid: { '2026-03': 'x' } }] }), today)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ date: '2026-02-05', late: true })
  })
  it('alerta único: atrasados antes de "vence hoje"', () => {
    const items = upcomingItems(dt, today)
    expect(dashboardAlert(items, today)).toMatchObject({ tone: 'late', count: 1, total: 300 })
    const noLate = items.filter((i) => !i.late)
    expect(dashboardAlert(noLate, today)).toMatchObject({ tone: 'today', count: 1, total: 80 })
    expect(dashboardAlert([], today)).toBeNull()
  })
  it('resumo: a receber, eu devo', () => {
    const s = dashboardSummary(dt, today)
    expect(s.toReceive).toBe(900)
    expect(s.toReceiveLate).toBe(300)
    expect(s.toPay).toBe(80)
  })
})

describe('storage (somente leitura)', () => {
  const today = '2026-03-10'
  it('aceita o formato legado (array de dívidas e pagamentos como datas)', () => {
    const raw = JSON.stringify([{ id: 'a', name: 'X', principal: 300, rate: 0, days: 90, date: '2026-01-10', payments: ['2026-02-10'] }])
    const d = parseAppData(raw, today)!
    expect(d.debts[0].installments).toBe(3)
    expect(d.debts[0].payments[0]).toEqual({ date: '2026-02-10', amount: 100 })
    expect(d.debts[0].kind).toBe('receivable')
    expect(d.debts[0].interestType).toBe('composto')
  })
  it('remove groupId órfão e filtra compras de cartão inválidas', () => {
    const raw = JSON.stringify({
      debts: [{ id: 'a', name: 'X', principal: 1, date: '2026-01-10', groupId: 'nao-existe' }],
      cards: [{ id: 'c', name: 'C', closingDay: 40 }],
      cardPurchases: [{ id: 'p', cardId: 'c', amount: 10, date: '2026-01-01' }, { id: 'q', cardId: 'zz', amount: 10, date: '2026-01-01' }],
    })
    const d = parseAppData(raw, today)!
    expect(d.debts[0].groupId).toBeUndefined()
    expect(d.cards[0].closingDay).toBe(1)
    expect(d.cardPurchases.map((p) => p.id)).toEqual(['p'])
  })
  it('JSON inválido → null', () => {
    expect(parseAppData('{oops', today)).toBeNull()
    expect(parseAppData(null, today)).toBeNull()
  })
  it('nunca escreve no localStorage e cai na demonstração quando vazio', () => {
    const store: Record<string, string> = {}
    const ls = {
      getItem: vi.fn((k: string) => store[k] ?? null),
      setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(),
    }
    vi.stubGlobal('localStorage', ls)
    const demo = loadAppData(today, '')
    expect(demo.source).toBe('demo')
    store[STORAGE_KEY] = JSON.stringify({ debts: [{ id: 'a', name: 'X', principal: 10, date: '2026-01-10' }] })
    const real = loadAppData(today, '')
    expect(real.source).toBe('local')
    expect(real.data.debts).toHaveLength(1)
    expect(loadAppData(today, '?dados=vazio').source).toBe('empty')
    expect(ls.setItem).not.toHaveBeenCalled()
    expect(ls.removeItem).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('demonstração tem atrasado e itens nos próximos 7 dias', () => {
    const demo = loadAppData(today, '?dados=demo').data
    const items = upcomingItems(demo, today)
    expect(items.some((i) => i.late)).toBe(true)
    expect(items.filter((i) => !i.late && i.date <= addDaysISO(today, 7)).length).toBeGreaterThan(3)
  })
})
