import type { ISODate, Transaction } from '@/lib/types'
import { daysBetweenISO } from './dates'

// Conferir o extrato do banco com o que está lançado numa carteira: o que já está no app, o que falta lançar e o que está no
// app mas não aparece no extrato (no período que o arquivo cobre). Só lê: quem grava é a importação.

export interface StatementLine {
  date: ISODate
  /** com sinal: negativo = saiu da conta */
  amount: number
  desc: string
  /** chave de importação (lançamento feito por uma importação anterior casa por ela) */
  imp: string
}

export interface Reconciliation {
  /** linhas do extrato que já têm lançamento no app */
  matched: StatementLine[]
  /** linhas do extrato sem lançamento (falta lançar) */
  missing: StatementLine[]
  /** lançamentos da carteira, dentro do período do extrato, que não aparecem nele */
  extra: Transaction[]
  from: ISODate
  to: ISODate
}

/** o banco costuma datar um ou dois dias depois do lançamento feito na mão */
const TOLERANCE_DAYS = 2

/** o valor que o lançamento tem NESTA carteira, com sinal (transferência: sai da origem, entra no destino) */
function signedIn(t: Transaction, walletId: string): number {
  if (t.type === 'entrada') return t.walletId === walletId ? t.amount : 0
  if (t.type === 'gasto') return t.walletId === walletId ? -t.amount : 0
  if (t.type === 'transferencia') return t.walletId === walletId ? -t.amount : t.toWalletId === walletId ? t.amount : 0
  return 0
}

export function reconcile(lines: StatementLine[], transactions: Transaction[], walletId: string): Reconciliation | null {
  if (!lines.length) return null
  const from = lines.reduce((m, l) => (l.date < m ? l.date : m), lines[0].date)
  const to = lines.reduce((m, l) => (l.date > m ? l.date : m), lines[0].date)
  const mine = transactions.filter((t) => signedIn(t, walletId) !== 0)
  const used = new Set<string>()
  const matched: StatementLine[] = []
  const missing: StatementLine[] = []
  // primeiro casa pela chave de importação; depois por valor e data próxima (cada lançamento casa uma vez)
  const free = (t: Transaction) => !used.has(t.id)
  for (const l of lines) {
    let hit = mine.find((t) => free(t) && !!t.imp && t.imp === l.imp)
    if (!hit) {
      hit = mine
        .filter((t) => free(t) && Math.abs(signedIn(t, walletId) - l.amount) < 0.005 && Math.abs(daysBetweenISO(t.date, l.date)) <= TOLERANCE_DAYS)
        .sort((a, b) => Math.abs(daysBetweenISO(a.date, l.date)) - Math.abs(daysBetweenISO(b.date, l.date)))[0]
    }
    if (hit) {
      used.add(hit.id)
      matched.push(l)
    } else missing.push(l)
  }
  const extra = mine.filter((t) => free(t) && t.date >= from && t.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1))
  return { matched, missing, extra, from, to }
}
