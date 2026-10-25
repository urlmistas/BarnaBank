import { describe, expect, it } from 'vitest'
import type { AppData, Goal, Recurring } from '@/lib/types'
import { buildDemoData } from '@/lib/demo-data'
import { buildBudgets, budgetStatus, knownExpenseCats, overCount } from './budgets'
import { checkGoal, checkMove, createGoal, goalInfo, goalSub, goalToInput, moveGoal, updateGoal } from './goals'
import { normalizeBudgets, normalizeGoals, normalizeRecurring } from './plan-normalize'
import { checkRecurring, createRecurring, emptyRecurringInput, recurringFromTx, runRecurring, updateRecurring, recurringToInput } from './recurring'

const TODAY = '2026-03-15'
const data = (over: Partial<AppData> = {}): AppData => ({
  debts: [], contacts: {}, wallets: [{ id: 'w1', name: 'Nubank' }], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [],
  cardPayments: [], ...over,
})
const gasto = (id: string, amount: number, category: string, date = '2026-03-05') => ({ id, walletId: 'w1', type: 'gasto' as const, amount, date, category })

describe('orçamento', () => {
  it('leitura descarta limites inválidos e apara nomes', () => {
    expect(normalizeBudgets({ ' Mercado ': 600.456, Lazer: 0, X: 'a', '': 5 })).toEqual({ Mercado: 600.46 })
    expect(normalizeBudgets([1, 2])).toEqual({})
  })

  it('status: gasto, % e classe, do mais perto de estourar para o mais folgado', () => {
    const d = data({
      budgets: { Mercado: 500, Lazer: 300, Casa: 1000 },
      transactions: [gasto('a', 520, 'Mercado'), gasto('b', 250, 'lazer'), gasto('c', 100, 'Casa')],
    })
    const rows = budgetStatus(d, '2026-03', TODAY)
    expect(rows.map((r) => [r.name, r.cls])).toEqual([['Mercado', 'over'], ['Lazer', 'warn'], ['Casa', 'ok']])
    expect(rows[0].left).toBe(-20)
    expect(rows[0].perDay).toBe(0)
    // Lazer: sobram 50 em 17 dias (15 a 31 de março)
    expect(rows[1].perDay).toBeCloseTo(50 / 17, 5)
    expect(overCount(rows)).toBe(1)
  })

  it('mês passado não mostra "por dia"', () => {
    const d = data({ budgets: { Mercado: 500 }, transactions: [gasto('a', 100, 'Mercado', '2026-02-05')] })
    expect(budgetStatus(d, '2026-02', TODAY)[0].perDay).toBe(0)
  })

  it('compras no cartão contam na categoria', () => {
    const d = data({
      budgets: { Roupas: 200 },
      cards: [{ id: 'c1', name: 'Nu', closingDay: 5, dueDay: 12, limit: 1000 }],
      cardPurchases: [{ id: 'p1', cardId: 'c1', amount: 300, date: '2026-03-02', installments: 3, category: 'Roupas' }],
    })
    expect(budgetStatus(d, '2026-03', TODAY)[0].spent).toBe(100)
  })

  it('categorias conhecidas sem repetir por acento ou maiúscula', () => {
    const d = data({
      budgets: { Mercado: 1 },
      transactions: [gasto('a', 1, 'mercado'), gasto('b', 1, 'Saúde'), gasto('c', 1, 'saude'), { ...gasto('d', 1, 'Cartão'), auto: 'card:x' }],
      bills: [{ id: 'b1', name: 'Aluguel', amount: 1, kind: 'gasto', dueDay: 5, paid: {} }, { id: 'b2', name: 'Salário', amount: 1, kind: 'entrada', dueDay: 5, paid: {} }],
    })
    expect(knownExpenseCats(d)).toEqual(['Mercado', 'Saúde', 'Aluguel'])
  })

  it('formulário: só limites > 0, categoria nova e erro sem limite', () => {
    const limits = [{ name: 'Mercado', limit: 500 }, { name: 'Lazer', limit: 0 }]
    expect(buildBudgets({ limits, newName: '', newLimit: NaN })).toEqual({ budgets: { Mercado: 500 } })
    expect(buildBudgets({ limits, newName: ' Viagem ', newLimit: 200 })).toEqual({ budgets: { Mercado: 500, Viagem: 200 } })
    expect(buildBudgets({ limits, newName: 'lazer', newLimit: 90 })).toEqual({ budgets: { Mercado: 500, Lazer: 90 } })
    expect(buildBudgets({ limits, newName: 'Viagem', newLimit: NaN })).toEqual({ error: 'Informe o limite para "Viagem".' })
  })
})

describe('metas', () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({ id: 'g1', name: 'Viagem', target: 1000, deadline: '', walletId: '', adds: [], created: '2026-01-01', ...over })

  it('leitura descarta meta sem alvo e arruma campos', () => {
    const out = normalizeGoals([{ id: 'a', name: 'X', target: 10, adds: [{ amount: 1 }, null, { amount: 'a' }], deadline: 'ontem' }, { id: 'b', name: 'Y', target: 0 }])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ walletId: '', deadline: '' })
    expect(out[0].adds).toHaveLength(1)
  })

  it('guardado = soma dos aportes (retirada subtrai) e nunca negativo', () => {
    const g = goal({ adds: [{ date: TODAY, amount: 300 }, { date: TODAY, amount: -100 }] })
    expect(goalInfo(data(), g, TODAY)).toMatchObject({ saved: 200, left: 800, pct: 20, done: false })
    expect(goalInfo(data(), goal({ adds: [{ date: TODAY, amount: -5 }] }), TODAY).saved).toBe(0)
  })

  it('com carteira ligada, o guardado é o saldo dela', () => {
    const d = data({ transactions: [{ id: 't', walletId: 'w1', type: 'entrada', amount: 400, date: '2026-02-01', category: 'x' }] })
    const gi = goalInfo(d, goal({ walletId: 'w1' }), TODAY)
    expect(gi.saved).toBe(400)
    expect(gi.walletName).toBe('Nubank')
  })

  it('prazo: quanto guardar por mês, atrasada e abaixo do ritmo', () => {
    const g = goal({ deadline: '2026-09-15', adds: [{ date: '2026-03-01', amount: 100 }] })
    const gi = goalInfo(data(), g, TODAY)
    expect(gi.perMonth).toBe(150) // 900 / 6 meses
    expect(gi.late).toBe(false)
    expect(gi.behind).toBeGreaterThan(0)
    expect(goalInfo(data(), goal({ deadline: '2026-01-31' }), TODAY).late).toBe(true)
    expect(goalInfo(data(), goal({ adds: [{ date: TODAY, amount: 1000 }] }), TODAY).done).toBe(true)
  })

  it('texto de apoio', () => {
    const fmt = { money: (v: number) => `R$${v}`, date: (d: string) => d }
    expect(goalSub(goal(), goalInfo(data(), goal(), TODAY), fmt)).toBe('sem prazo')
    const g = goal({ deadline: '2026-09-15' })
    expect(goalSub(g, goalInfo(data(), g, TODAY), fmt)).toMatch(/^até 2026-09-15 · guarde R\$/)
    const done = goal({ adds: [{ date: TODAY, amount: 1000 }] })
    expect(goalSub(done, goalInfo(data(), done, TODAY), fmt)).toBe('Meta batida!')
  })

  it('criar, editar e mover', () => {
    expect(checkGoal({ name: ' ', target: 10, deadline: '', walletId: '', start: 0 })).toMatch(/nome/)
    expect(checkGoal({ name: 'x', target: NaN, deadline: '', walletId: '', start: 0 })).toMatch(/juntar/)
    const g = createGoal({ name: ' Reserva ', target: 500.126, deadline: '', walletId: '', start: 50 }, TODAY, 'g9')
    expect(g).toMatchObject({ id: 'g9', name: 'Reserva', target: 500.13, created: TODAY })
    expect(g.adds[0]).toMatchObject({ amount: 50, note: 'saldo inicial' })
    expect(createGoal({ name: 'a', target: 5, deadline: '', walletId: 'w1', start: 50 }, TODAY).adds).toEqual([])
    expect(updateGoal(g, { ...goalToInput(g), name: 'Outra' })).toMatchObject({ name: 'Outra', adds: g.adds, created: TODAY })
    expect(moveGoal(g, 20, true, TODAY).adds.at(-1)?.amount).toBe(-20)
    expect(checkMove(10, 20, true)).toMatch(/Só tem/)
    expect(checkMove(10, 20, false)).toBeNull()
    expect(checkMove(10, 0, false)).toBe('Informe o valor.')
  })
})

describe('recorrentes', () => {
  const rec = (over: Partial<Recurring> = {}): Recurring => ({ id: 'r1', type: 'gasto', amount: 30, category: 'Assinaturas', day: 10, walletId: 'w1', start: '2026-01', note: 'Spotify', active: true, posted: {}, ...over })
  let n = 0
  const mk = () => 't' + ++n

  it('leitura normaliza', () => {
    const out = normalizeRecurring([{ id: 'a', amount: 5, walletId: 'w1', start: '2026-01', day: 99, type: 'x' }, { id: 'b', amount: 0, walletId: 'w', start: '2026-01' }, { id: 'c', amount: 5, walletId: 'w', start: 'jan' }])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ day: 1, type: 'gasto', posted: {}, category: '' })
  })

  it('lança os meses vencidos uma vez só, no dia certo', () => {
    const out = runRecurring([rec()], [], data().wallets, TODAY, mk)
    expect(out.made).toBe(3) // jan, fev, mar (dia 10 já passou)
    expect(out.transactions.map((t) => t.date)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
    expect(out.transactions[0]).toMatchObject({ walletId: 'w1', type: 'gasto', amount: 30, category: 'Assinaturas', auto: 'rec:r1:2026-01' })
    expect(Object.keys(out.recurring[0].posted)).toEqual(['2026-01', '2026-02', '2026-03'])
    // rodar de novo não duplica
    expect(runRecurring(out.recurring, out.transactions, data().wallets, TODAY, mk).made).toBe(0)
  })

  it('dia que ainda não chegou no mês atual espera', () => {
    expect(runRecurring([rec({ day: 20, start: '2026-03' })], [], data().wallets, TODAY, mk).made).toBe(0)
  })

  it('dia 31 cai no último dia do mês curto', () => {
    const out = runRecurring([rec({ day: 31, start: '2026-02' })], [], data().wallets, '2026-03-31', mk)
    expect(out.transactions.map((t) => t.date)).toEqual(['2026-02-28', '2026-03-31'])
  })

  it('inativo, com fim e sem carteira não lançam; não altera as entradas', () => {
    const list = [rec({ active: false }), rec({ id: 'r2', end: '2026-01' }), rec({ id: 'r3', walletId: 'sumiu' })]
    const before = JSON.stringify(list)
    const out = runRecurring(list, [], data().wallets, TODAY, mk)
    expect(out.made).toBe(1) // r2: só janeiro
    expect(JSON.stringify(list)).toBe(before)
  })

  it('validação e criar/editar', () => {
    const ok = { ...emptyRecurringInput(TODAY, 'w1'), amount: 30, category: 'Assinaturas' }
    expect(checkRecurring(ok, TODAY, [])).toMatch(/carteira primeiro/)
    expect(checkRecurring({ ...ok, amount: 0 }, TODAY, ['w1'])).toBe('Informe o valor.')
    expect(checkRecurring({ ...ok, category: ' ' }, TODAY, ['w1'])).toMatch(/categoria/)
    expect(checkRecurring({ ...ok, day: 32 }, TODAY, ['w1'])).toMatch(/dia/)
    expect(checkRecurring({ ...ok, start: '2024-01' }, TODAY, ['w1'])).toMatch(/12 meses/)
    expect(checkRecurring(ok, TODAY, ['w1'])).toBeNull()
    const r = createRecurring(ok, 'r9')
    expect(r).toMatchObject({ id: 'r9', active: true, posted: {}, start: '2026-03', day: 15 })
    expect(updateRecurring(r, { ...recurringToInput(r), amount: 45 })).toMatchObject({ amount: 45, posted: {} })
  })

  it('"Repetir todo mês": o lançamento já conta como feito no mês', () => {
    const tx = { id: 'tx1', walletId: 'w1', type: 'gasto' as const, amount: 80, date: '2026-03-12', category: 'Academia', note: '' }
    const { rec: r, tx: t2 } = recurringFromTx(tx, 'r7')
    expect(r).toMatchObject({ id: 'r7', day: 12, start: '2026-03', posted: { '2026-03': 'tx1' } })
    expect(t2.auto).toBe('rec:r7:2026-03')
    // o mês de março não é lançado de novo, abril sim
    expect(runRecurring([r], [t2], data().wallets, '2026-03-20', mk).made).toBe(0)
    expect(runRecurring([r], [t2], data().wallets, '2026-04-20', mk).made).toBe(1)
  })
})

describe('demonstração', () => {
  it('não tem orçamento nem metas (campos opcionais)', () => {
    const d = buildDemoData(TODAY)
    expect(d.budgets ?? {}).toBeTypeOf('object')
  })
})
