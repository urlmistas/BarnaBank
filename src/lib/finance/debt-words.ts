import type { Debt } from '@/lib/types'

/** venda a prazo (sem juros) ao invés de empréstimo; só existe em "me devem" */
export function isSale(d: Pick<Debt, 'kind' | 'op'>): boolean {
  return d.kind === 'receivable' && d.op === 'venda'
}
