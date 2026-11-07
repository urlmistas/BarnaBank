import type { ISODate } from '@/lib/types'
import type { PersonDetail } from './people'

// Fatos rápidos para a página da pessoa: quantas dívidas, quando vence a próxima, quando foi o último pagamento.

export interface PersonFacts {
  openCount: number
  paidCount: number
  /** próxima parcela a vencer (hoje ou depois) entre as dívidas em aberto */
  nextDue: ISODate | null
  /** data do pagamento mais recente (entrada ou saída) */
  lastPayment: ISODate | null
  paymentsCount: number
  /** a receber menos o que eu devo; positivo = a pessoa me deve */
  net: number
  status: 'late' | 'open' | 'settled'
}

export function personFacts(p: PersonDetail, today: ISODate): PersonFacts {
  const open = p.debts.filter((v) => !v.paid)
  const dues = open.flatMap((v) => v.insts.filter((it) => it.open > 0.005 && it.dueISO >= today).map((it) => it.dueISO)).sort()
  const lastPayment = p.history.reduce<ISODate | null>((best, h) => (!best || h.date > best ? h.date : best), null)
  const late = p.totals.overdue > 0.005
  return {
    openCount: open.length,
    paidCount: p.debts.length - open.length,
    nextDue: dues[0] ?? null,
    lastPayment,
    paymentsCount: p.history.length,
    net: p.totals.toReceive - p.totals.owe,
    status: late ? 'late' : open.length ? 'open' : 'settled',
  }
}
