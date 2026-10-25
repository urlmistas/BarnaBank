import { describe, expect, it } from 'vitest'
import type { AppData, Bill, Debt } from '@/lib/types'
import { calendarGrid, calendarTotals, defaultDay, monthEvents } from './calendar'
import { monthForecast, monthPlan, simulatePurchase, ymShort } from './fits'
import { searchAll } from './search'
import { simulateLoan } from './simulator'

const TODAY = '2026-03-15'
const empty = (): AppData => ({ debts: [], contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [] })
const money = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
const fmt = { money, date: (d: string) => d }

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Ana Souza', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto', installments: 3, days: 90, date: '2026-01-10',
  dueDay: 10, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: 'moto', ...over,
})
const bill = (over: Partial<Bill> = {}): Bill => ({ id: 'b1', name: 'Aluguel', amount: 1000, kind: 'gasto', dueDay: 20, paid: {}, category: 'Moradia', ...over })

const base = (): AppData => ({
  ...empty(),
  wallets: [{ id: 'w1', name: 'Nubank' }],
  transactions: [{ id: 't1', walletId: 'w1', type: 'entrada', amount: 5000, date: '2026-03-01', category: 'Salário', note: 'março' }],
  bills: [bill()],
  cards: [{ id: 'c1', name: 'Roxinho', closingDay: 5, dueDay: 12, limit: 3000 }],
  debts: [debt()],
})

describe('previsão do mês', () => {
  it('saldo + o que falta entrar - o que falta sair', () => {
    const f = monthForecast(base(), TODAY)
    // 5000 de saldo + parcela de 100 em atraso/aberta de março (10/03 venceu) - aluguel 1000
    expect(f.start).toBe(5000)
    expect(f.rows.find((r) => r.label.startsWith('A receber'))?.value).toBeGreaterThan(0)
    expect(f.rows.find((r) => r.label === 'Contas fixas que faltam')?.value).toBe(-1000)
    expect(f.end).toBeLessThan(f.start + 300)
    expect(f.month).toBe('março')
  })

  it('conta fixa já paga não entra; recorrente que ainda não lançou entra', () => {
    const d = base()
    d.bills = [bill({ paid: { '2026-03': 'x' } })]
    d.recurring = [{ id: 'r1', type: 'gasto', amount: 50, category: 'Streaming', day: 25, walletId: 'w1', start: '2026-01', posted: {} }]
    const f = monthForecast(d, TODAY)
    expect(f.rows.find((r) => r.label === 'Contas fixas que faltam')).toBeUndefined()
    expect(f.rows.find((r) => r.label === 'Recorrentes que ainda saem')?.value).toBe(-50)
    d.recurring[0].posted = { '2026-03': 'tx' }
    expect(monthForecast(d, TODAY).rows.find((r) => r.label === 'Recorrentes que ainda saem')).toBeUndefined()
  })

  it('monthPlan de um mês futuro soma contas e dívidas do mês', () => {
    const p = monthPlan(base(), '2026-04', TODAY)
    expect(p.out).toBe(1000)
    expect(p.in).toBe(100)
  })
})

describe('cabe no mês?', () => {
  it('compra pequena à vista cabe', () => {
    const r = simulatePurchase(base(), TODAY, 100, 1, { kind: 'wallet', id: 'w1' })
    expect(r.verdict).toBe('ok')
    expect(r.rows.length).toBeGreaterThanOrEqual(3)
    expect(r.rows[0].with).toBe(r.rows[0].without - 100)
  })

  it('compra grande não cabe e indica o pior mês', () => {
    const r = simulatePurchase(base(), TODAY, 20000, 1, { kind: 'wallet', id: 'w1' })
    expect(r.verdict).toBe('no')
    expect(r.minWith).toBeLessThan(0)
    expect(r.minKey).not.toBeNull()
  })

  it('no cartão a primeira parcela cai na fatura certa e o limite pesa', () => {
    const r = simulatePurchase(base(), TODAY, 1200, 4, { kind: 'card', id: 'c1' })
    // hoje (15/03) já passou do fechamento (dia 5): vai para a fatura de abril, que vence em 12/04
    expect(r.firstKey).toBe('2026-04')
    expect(r.parcel).toBe(300)
    expect(r.rows.filter((x) => x.cost > 0)).toHaveLength(4)
    const over = simulatePurchase(base(), TODAY, 3500, 1, { kind: 'card', id: 'c1' })
    expect(over.verdict).toBe('no')
    expect(over.limitMsg).toMatch(/limite do Roxinho/)
  })

  it('ymShort', () => expect(ymShort('2026-10')).toBe('out/26'))
})

describe('calendário', () => {
  it('junta parcelas, contas fixas e faturas do mês, ordenadas por dia', () => {
    const d = base()
    d.cardPurchases = [{ id: 'p1', cardId: 'c1', amount: 200, date: '2026-02-20', installments: 1 }]
    const ev = monthEvents(d, '2026-03', TODAY)
    expect(ev.map((e) => e.kind)).toEqual(['debt', 'card', 'bill'])
    expect(ev.map((e) => e.date)).toEqual(['2026-03-10', '2026-03-12', '2026-03-20'])
    expect(ev[0]).toMatchObject({ title: 'Ana Souza', dir: 'in', late: true, to: '/pessoas/ana%20souza' })
    expect(ev[1]).toMatchObject({ title: 'Fatura Roxinho', amount: 200, to: '/contas/cartao-c1?m=2026-03' })
    expect(ev[2]).toMatchObject({ title: 'Aluguel', done: false, to: '/contas/fixa-b1?m=2026-03' })
  })

  it('o que já foi resolvido fica marcado e não entra no total', () => {
    const d = base()
    d.bills = [bill({ paid: { '2026-03': 'x' } })]
    d.debts = [debt({ payments: [{ date: '2026-03-10', amount: 300, mode: 'fifo' }] })]
    const ev = monthEvents(d, '2026-03', TODAY)
    expect(ev.every((e) => e.done)).toBe(true)
    expect(calendarTotals(ev)).toEqual({ in: 0, out: 0 })
  })

  it('a recorrente aparece no dia dela', () => {
    const d = base()
    d.recurring = [{ id: 'r1', type: 'entrada', amount: 80, category: 'Freela', day: 31, walletId: 'w1', start: '2026-01', posted: {} }]
    const ev = monthEvents(d, '2026-02', TODAY)
    expect(ev.find((e) => e.kind === 'rec')).toMatchObject({ date: '2026-02-28', dir: 'in' })
  })

  it('grade: março de 2026 começa no domingo, com 31 dias', () => {
    const ev = monthEvents(base(), '2026-03', TODAY)
    const grid = calendarGrid('2026-03', ev)
    expect(grid.filter((g) => g.day === 0)).toHaveLength(0) // 1º de março de 2026 é domingo
    expect(grid).toHaveLength(31)
    expect(grid[9]).toMatchObject({ day: 10, hasIn: true, hasLate: true })
    const feb = calendarGrid('2026-02', [])
    expect(feb.filter((g) => g.day === 0)).toHaveLength(0)
    expect(calendarGrid('2026-04', []).filter((g) => g.day === 0)).toHaveLength(3)
  })

  it('dia inicial: hoje no mês atual; senão o primeiro em aberto', () => {
    const ev = monthEvents(base(), '2026-04', TODAY)
    expect(defaultDay('2026-03', ev, TODAY)).toBe(TODAY)
    expect(defaultDay('2026-04', ev, TODAY)).toBe(ev[0].date)
    expect(defaultDay('2027-01', [], TODAY)).toBe('2027-01-01')
  })
})

describe('busca', () => {
  it('acha por nome, categoria, anotação e conta fixa, com rota', () => {
    const d = base()
    d.cardPurchases = [{ id: 'p1', cardId: 'c1', amount: 45, date: '2026-03-02', installments: 2, desc: 'Tênis', category: 'Roupas' }]
    const secs = searchAll(d, 'ana', TODAY, fmt)
    expect(secs.map((s) => s.title)).toEqual(['Pessoas'])
    expect(secs[0].items[0]).toMatchObject({ title: 'Ana Souza', to: '/pessoas/ana%20souza' })
    expect(searchAll(d, 'MORADIA', TODAY, fmt)[0]).toMatchObject({ title: 'Contas fixas' })
    expect(searchAll(d, 'moto', TODAY, fmt)[0].title).toBe('Dívidas')
    expect(searchAll(d, 'tenis', TODAY, fmt)[0].items[0].to).toBe('/contas/cartao-c1?m=2026-03')
    expect(searchAll(d, 'nubank', TODAY, fmt)[0].items[0].to).toBe('/carteiras/w1')
  })

  it('número digitado acha por valor', () => {
    const secs = searchAll(base(), '5.000,00', TODAY, fmt)
    expect(secs.map((s) => s.title)).toEqual(['Lançamentos'])
    expect(searchAll(base(), '1000', TODAY, fmt).map((s) => s.title)).toEqual(['Contas fixas'])
  })

  it('vazio, sem resultado e consulta enorme', () => {
    expect(searchAll(base(), '   ', TODAY, fmt)).toEqual([])
    expect(searchAll(base(), 'zzzz', TODAY, fmt)).toEqual([])
    expect(searchAll(base(), 'a'.repeat(5000), TODAY, fmt)).toEqual([])
  })

  it('mostra no máximo 6 por seção e conta o resto', () => {
    const d = base()
    d.transactions = Array.from({ length: 9 }, (_, i) => ({ id: 't' + i, walletId: 'w1', type: 'gasto' as const, amount: i + 1, date: '2026-03-0' + (i + 1), category: 'Mercado' }))
    const s = searchAll(d, 'mercado', TODAY, fmt)[0]
    expect(s.items).toHaveLength(6)
    expect(s.more).toBe(3)
  })

  it('metas e grupos entram quando existem', () => {
    const d = base()
    d.goals = [{ id: 'g1', name: 'Viagem', target: 3000, deadline: '', walletId: '', adds: [] }]
    d.groups = [{ id: 'gr', title: 'Churrasco', kind: 'receivable', total: 120 }]
    expect(searchAll(d, 'viagem', TODAY, fmt)[0]).toMatchObject({ title: 'Metas' })
    expect(searchAll(d, 'churrasco', TODAY, fmt)[0].items[0].to).toBe('/pessoas?q=Churrasco')
  })
})

describe('simulador de empréstimo', () => {
  it('juros compostos, simples e Price', () => {
    const c = simulateLoan(100, 10, 3, 'composto', money)
    expect(c.total).toBeCloseTo(133.1, 5)
    expect(c.installment).toBeCloseTo(44.3667, 3)
    expect(c.profit).toBeCloseTo(33.1, 5)
    expect(c.formula[0]).toContain('R$ 100,00 × (1 + 10%)³')
    expect(simulateLoan(100, 10, 3, 'simples', money).total).toBeCloseTo(130, 5)
    const p = simulateLoan(100, 10, 3, 'price', money)
    expect(p.total).toBeCloseTo(120.63, 2)
    expect(p.formula.join(' ')).toContain('Parcela =')
  })

  it('entradas inválidas viram zero/uma parcela, sem NaN', () => {
    const s = simulateLoan(NaN, -5, 0, 'composto', money)
    expect(s.total).toBe(0)
    expect(Number.isNaN(s.installment)).toBe(false)
  })
})
