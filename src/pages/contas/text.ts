import type { ContaFilter, ContaRow } from '@/lib/finance/contas'
import { MONTHS, plural } from '@/lib/format'
import type { YearMonth } from '@/lib/types'

export const FILTER_LABEL: Record<ContaFilter, string> = {
  todas: 'Todas',
  pendentes: 'Pendentes',
  pagas: 'Pagas',
  atrasadas: 'Atrasadas',
}

/** complemento das frases ("3 contas pendentes", "nenhuma conta atrasada") */
export const FILTER_IN: Record<ContaFilter, string> = {
  todas: '',
  pendentes: ' pendentes',
  pagas: ' pagas',
  atrasadas: ' atrasadas',
}

export const monthTitle = (ym: YearMonth) => `${MONTHS[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`
export const monthName = (ym: YearMonth) => MONTHS[+ym.slice(5, 7) - 1]
/** "out 2026" */
export const monthShort = (ym: YearMonth) => `${MONTHS[+ym.slice(5, 7) - 1].slice(0, 3)} ${ym.slice(0, 4)}`

/** texto do status (badge) */
export function statusText(r: Pick<ContaRow, 'status' | 'income'>): string {
  switch (r.status) {
    case 'paga':
      return r.income ? 'recebida' : 'paga'
    case 'atrasada':
      return 'atrasada'
    case 'hoje':
      return 'vence hoje'
    case 'vazia':
      return 'sem compras'
    default:
      return 'pendente'
  }
}

/** linha discreta sob o nome: vencimento / pagamento */
export function dueText(r: ContaRow, date: (iso: string) => string): string {
  if (r.status === 'paga') {
    const verb = r.income ? 'recebida' : 'paga'
    return r.paidDate ? `${verb} em ${date(r.paidDate)}` : `${verb} · venceu ${date(r.due)}`
  }
  if (r.status === 'atrasada') return `venceu ${date(r.due)} · há ${plural(-r.diff, 'dia', 'dias')}`
  if (r.status === 'hoje') return `vence hoje, ${date(r.due)}`
  if (r.diff === 1) return `vence amanhã, ${date(r.due)}`
  if (r.diff > 1 && r.diff <= 7) return `vence em ${r.diff} dias, ${date(r.due)}`
  return `vence ${date(r.due)}`
}

export function contaHref(id: string, search: string) {
  return '/contas/' + encodeURIComponent(id) + (search ? '?' + search : '')
}
