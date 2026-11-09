import { makeDebtCalc } from '@/lib/finance/debts'
import { quickPayment } from '@/lib/finance/mutations'
import type { Debt, ISODate, Payment } from '@/lib/types'

export interface QuickTarget {
  debt: Debt
  payment: Payment
  /** receber (a pessoa me deve) ou pagar (eu devo) */
  dir: 'in' | 'out'
}

/**
 * O pagamento rápido da pessoa para o gesto de deslizar o card: a dívida em aberto que vence primeiro, do lado em que ela
 * mais pesa (`net` ≥ 0: o que ela me deve; senão, o que eu devo). Se esse lado não tem nada em aberto, usa o outro.
 * null quando não há nada a pagar nem receber.
 */
export function quickTarget(debts: Debt[], net: number, today: ISODate, walletId?: string): QuickTarget | null {
  const calc = makeDebtCalc(today)
  const open = (kind: 'receivable' | 'payable') =>
    debts
      .filter((d) => (kind === 'payable' ? d.kind === 'payable' : d.kind !== 'payable') && !calc.isPaid(d))
      .sort((a, b) => (calc.nextDueDate(a)?.getTime() ?? Infinity) - (calc.nextDueDate(b)?.getTime() ?? Infinity))
  const order: ('receivable' | 'payable')[] = net >= 0 ? ['receivable', 'payable'] : ['payable', 'receivable']
  for (const kind of order) {
    for (const debt of open(kind)) {
      const payment = quickPayment(debt, today, walletId)
      if (payment) return { debt, payment, dir: kind === 'payable' ? 'out' : 'in' }
    }
  }
  return null
}
