import { describe, expect, it } from 'vitest'
import { personFacts } from './person-facts'
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

  it('sem dívidas nem pagamentos', () => {
    expect(personFacts(person({}), '2026-11-07')).toMatchObject({ openCount: 0, nextDue: null, lastPayment: null, status: 'settled', net: 0 })
  })
})
