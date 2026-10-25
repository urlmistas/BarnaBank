import type { PersonRow } from '@/lib/finance/people'

// Lado da lista de Pessoas: todos, só quem me deve ou só a quem eu devo.

export type PeopleSide = 'todos' | 'receber' | 'pagar'
export const PEOPLE_SIDES: PeopleSide[] = ['todos', 'receber', 'pagar']
export const SIDE_LABEL: Record<PeopleSide, string> = { todos: 'Todos', receber: 'Me devem', pagar: 'Eu devo' }

/** só quem tem dívida daquele lado; o valor passa a ser só daquele lado (não o saldo dos dois) */
export function rowsOfSide(rows: PersonRow[], side: PeopleSide): PersonRow[] {
  if (side === 'todos') return rows
  const kind = side === 'receber' ? 'receivable' : 'payable'
  return rows.filter((r) => r.debts.some((d) => d.kind === kind)).map((r) => ({ ...r, net: side === 'receber' ? r.toReceive : -r.toPay }))
}
