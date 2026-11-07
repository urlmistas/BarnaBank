import { describe, expect, it } from 'vitest'
import { balanceSeries, monthlyPayments, personFacts, personTimeline, punctuality } from './person-facts'
import type { PersonDetail } from './people'

const inst = (dueISO: string, open: number) => ({ dueISO, open }) as PersonDetail['debts'][number]['insts'][number]
const view = (paid: boolean, insts: ReturnType<typeof inst>[]) => ({ paid, insts }) as PersonDetail['debts'][number]
const person = (over: Partial<PersonDetail>): PersonDetail =>
  ({
    key: 'ana', name: 'Ana', since: '2026-01-01', hasReceivable: true, hasPayable: false, history: [], debts: [],
    totals: { lent: 0, received: 0, toReceive: 0, overdue: 0, owe: 0, paidOut: 0 },
    ...over,
  }) as PersonDetail

describe('personFacts', () => {
  it('conta abertas e quitadas e acha a próxima parcela a vencer', () => {
    const p = person({
      debts: [view(false, [inst('2026-10-01', 0), inst('2026-11-20', 50), inst('2026-12-20', 50)]), view(true, [inst('2026-05-01', 0)]), view(false, [inst('2026-11-15', 30)])],
      totals: { lent: 300, received: 100, toReceive: 130, overdue: 0, owe: 0, paidOut: 0 },
    })
    const f = personFacts(p, '2026-11-07')
    expect(f).toMatchObject({ openCount: 2, paidCount: 1, nextDue: '2026-11-15', net: 130, status: 'open' })
  })

  it('parcela já vencida não vira "próxima" e marca atraso', () => {
    const p = person({
      debts: [view(false, [inst('2026-10-01', 80)])],
      totals: { lent: 80, received: 0, toReceive: 80, overdue: 80, owe: 0, paidOut: 0 },
    })
    const f = personFacts(p, '2026-11-07')
    expect(f.nextDue).toBeNull()
    expect(f.status).toBe('late')
  })

  it('pega o pagamento mais recente e o saldo desconta o que eu devo', () => {
    const p = person({
      history: [
        { date: '2026-09-01', amount: 10, dir: 'in' },
        { date: '2026-10-05', amount: 5, dir: 'out' },
        { date: '2026-08-01', amount: 1, dir: 'in' },
      ] as PersonDetail['history'],
      debts: [view(true, [])],
      totals: { lent: 10, received: 10, toReceive: 20, overdue: 0, owe: 60, paidOut: 5 },
    })
    const f = personFacts(p, '2026-11-07')
    expect(f).toMatchObject({ lastPayment: '2026-10-05', paymentsCount: 3, net: -40, status: 'settled' })
  })

  it('conta dívidas em atraso e as parcelas vencidas delas', () => {
    const late = (n: number) => ({ paid: false, status: 'atrasado', overdueCount: n, insts: [] }) as unknown as PersonDetail['debts'][number]
    const ok = { paid: false, status: 'em dia', overdueCount: 0, insts: [] } as unknown as PersonDetail['debts'][number]
    const quitada = { paid: true, status: 'pago', overdueCount: 0, insts: [] } as unknown as PersonDetail['debts'][number]
    const f = personFacts(person({ debts: [late(2), late(1), ok, quitada] }), '2026-11-07')
    expect(f).toMatchObject({ lateCount: 2, lateInstallments: 3 })
  })

  it('sem dívidas nem pagamentos', () => {
    expect(personFacts(person({}), '2026-11-07')).toMatchObject({ openCount: 0, nextDue: null, lastPayment: null, status: 'settled', net: 0 })
  })
})

describe('monthlyPayments', () => {
  it('dá 12 meses terminando no mês de hoje e soma entradas e saídas', () => {
    const h = [
      { date: '2026-11-03', amount: 50, dir: 'in' },
      { date: '2026-11-20', amount: 25.5, dir: 'in' },
      { date: '2026-10-01', amount: 10, dir: 'out' },
      { date: '2025-12-15', amount: 7, dir: 'in' },
      { date: '2025-11-30', amount: 99, dir: 'in' },
    ] as PersonDetail['history']
    const pts = monthlyPayments(h, '2026-11-07', 12)
    expect(pts).toHaveLength(12)
    expect(pts[0]).toMatchObject({ key: '2025-12', label: 'dez', in: 7 })
    expect(pts[11]).toMatchObject({ key: '2026-11', label: 'nov', full: 'novembro de 2026', in: 75.5, out: 0 })
    expect(pts[10]).toMatchObject({ key: '2026-10', out: 10 })
    // 2025-11 está fora da janela
    expect(pts.reduce((s, x) => s + x.in, 0)).toBe(82.5)
  })

  it('vira o ano corretamente', () => {
    const pts = monthlyPayments([], '2026-02-10', 4)
    expect(pts.map((x) => x.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('punctuality e quitação prevista', () => {
  it('conta parcelas pagas antes, no dia e depois do vencimento', () => {
    const paga = (timing: 'late' | 'early' | null) => ({ state: 'paga', timing, dueISO: '2026-01-01', open: 0 }) as unknown as PersonDetail['debts'][number]['insts'][number]
    const p = person({ debts: [view(false, [paga('late'), paga('early'), paga(null), paga(null), inst('2026-12-01', 10)])] })
    expect(punctuality(p)).toEqual({ early: 1, onTime: 2, late: 1, total: 4 })
  })

  it('quitação prevista é o vencimento da última parcela em aberto', () => {
    const p = person({ debts: [view(false, [inst('2026-11-20', 50), inst('2027-02-20', 50)]), view(false, [inst('2026-12-10', 5)])] })
    expect(personFacts(p, '2026-11-07').payoffDate).toBe('2027-02-20')
  })
})

describe('personTimeline', () => {
  it('junta dívida criada, pagamentos, parcela vencida e quitação, do mais novo para o mais antigo', () => {
    const debt = (id: string, date: string, paid: boolean, insts: unknown[]) =>
      ({ paid, kind: 'receivable', label: 'Moto', total: 200, n: 2, debt: { id, date }, insts }) as unknown as PersonDetail['debts'][number]
    const p = person({
      debts: [
        debt('d1', '2026-08-01', false, [{ i: 0, open: 0, dueISO: '2026-09-01' }, { i: 1, open: 100, dueISO: '2026-10-01' }]),
        debt('d2', '2026-05-01', true, [{ i: 0, open: 0, dueISO: '2026-06-01' }]),
      ],
      history: [
        { key: 'h1', date: '2026-09-02', amount: 100, dir: 'in', debtId: 'd1', debtLabel: 'Moto', index: 0 },
        { key: 'h2', date: '2026-06-03', amount: 50, dir: 'in', debtId: 'd2', debtLabel: 'Moto', index: 0, note: 'pix' },
      ] as PersonDetail['history'],
    })
    const tl = personTimeline(p, '2026-11-07')
    expect(tl.map((x) => x.kind)).toEqual(['late', 'in', 'debt', 'done', 'in', 'debt'])
    expect(tl[0]).toMatchObject({ date: '2026-10-01', title: '2ª parcela venceu sem pagamento', amount: 100 })
    expect(tl.find((x) => x.key === 'done:d2')?.date).toBe('2026-06-03')
    expect(tl.find((x) => x.key === 'pay:h2')?.detail).toBe('Moto · pix')
  })

  it('sem nada, lista vazia', () => {
    expect(personTimeline(person({}), '2026-11-07')).toEqual([])
  })
})

describe('balanceSeries', () => {
  it('sobe com a dívida e desce com o que foi recebido, e estende até hoje', () => {
    const p = person({
      debts: [{ kind: 'receivable', total: 300, debt: { date: '2026-08-01' }, paid: false, insts: [] }] as unknown as PersonDetail['debts'],
      history: [
        { date: '2026-09-01', amount: 100, dir: 'in' },
        { date: '2026-10-01', amount: 50, dir: 'in' },
      ] as PersonDetail['history'],
    })
    expect(balanceSeries(p, '2026-11-07')).toEqual([
      { date: '2026-08-01', balance: 300 },
      { date: '2026-09-01', balance: 200 },
      { date: '2026-10-01', balance: 150 },
      { date: '2026-11-07', balance: 150 },
    ])
  })

  it('dívida minha deixa o saldo negativo; vários eventos no mesmo dia viram um ponto', () => {
    const p = person({
      debts: [{ kind: 'payable', total: 80, debt: { date: '2026-10-01' }, paid: false, insts: [] }] as unknown as PersonDetail['debts'],
      history: [{ date: '2026-10-01', amount: 30, dir: 'out' }] as PersonDetail['history'],
    })
    expect(balanceSeries(p, '2026-10-01')).toEqual([{ date: '2026-10-01', balance: -50 }])
  })
})
