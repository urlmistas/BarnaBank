import type { InvoiceStatus } from '@/lib/finance/bills-cards'
import type { MovementFilter, WalletCardInfo } from '@/lib/finance/wallets'

export const INV_TXT: Record<InvoiceStatus, string> = {
  atrasada: 'atrasada', paga: 'paga', vazia: 'sem compras', fechada: 'fechada', aberta: 'aberta',
}

export const FILTER_LABEL: Record<MovementFilter, string> = {
  todos: 'Todos',
  entradas: 'Entradas',
  saidas: 'Saídas',
  transferencias: 'Transferências',
}

/** "nenhuma saída", "nenhum movimento"… para os estados sem resultado */
export const FILTER_NONE: Record<MovementFilter, string> = {
  todos: 'Nenhum movimento',
  entradas: 'Nenhuma entrada',
  saidas: 'Nenhuma saída',
  transferencias: 'Nenhuma transferência',
}

/** frase para leitores de tela: cartão, fatura, vencimento e limite */
export function cardSummary(c: WalletCardInfo, money: (v: number) => string, date: (iso: string) => string) {
  const parts = [`Cartão ${c.card.name}: fatura ${money(c.invoiceTotal)} (${INV_TXT[c.invoiceStatus]})`, `vence ${date(c.due)}`]
  if (c.usedPct !== null) parts.push(`${Math.round(c.usedPct)}% do limite usado`)
  return parts.join(', ')
}

/** tira o ano da data já formatada: 27/10/26 → 27/10, 2026-10-27 → 10-27 */
export const noYear = (s: string) => (/^\d{4}-/.test(s) ? s.slice(5) : s.replace(/\/\d{2}$/, ''))
