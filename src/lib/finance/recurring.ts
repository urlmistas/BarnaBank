import type { ISODate, Recurring, Transaction, Wallet, YearMonth } from '@/lib/types'
import { dayIn, round2, ymAdd, ymOf } from './dates'

// Lançamentos recorrentes (runRecurring ~l.5249, recurringDialog ~l.5269). Entram sozinhos na carteira todo mês,
// no dia escolhido, sem precisar marcar como pago. Puro.

export const newRecId = (prefix = 'r-') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/**
 * Cria as transações dos meses que já passaram e ainda não foram lançadas (até 36 meses por recorrente).
 * Devolve novas listas (não altera as de entrada) e quantos lançamentos nasceram.
 */
export function runRecurring(
  recurring: Recurring[],
  transactions: Transaction[],
  wallets: Pick<Wallet, 'id'>[],
  today: ISODate,
  mkId: () => string = () => newRecId('t-'),
): { recurring: Recurring[]; transactions: Transaction[]; made: number } {
  const nowKey = ymOf(today)
  const txs = [...transactions]
  let made = 0
  const next = recurring.map((r) => {
    if (r.active === false || !r.start) return r
    const posted = { ...(r.posted || {}) }
    let touched = false
    let k: YearMonth = r.start
    let guard = 0
    while (k <= nowKey && guard++ < 36) {
      if (r.end && k > r.end) break
      const dt = dayIn(k, r.day)
      if (!posted[k] && dt <= today && wallets.some((w) => w.id === r.walletId)) {
        const tx: Transaction = {
          id: mkId(), walletId: r.walletId, type: r.type, amount: r.amount, date: dt, category: r.category, note: r.note || '',
          auto: 'rec:' + r.id + ':' + k,
        }
        txs.push(tx)
        posted[k] = tx.id
        touched = true
        made++
      }
      k = ymAdd(k, 1)
    }
    return touched ? { ...r, posted } : r
  })
  return { recurring: next, transactions: txs, made }
}

export interface RecurringInput {
  type: 'entrada' | 'gasto'
  amount: number
  category: string
  day: number
  walletId: string
  start: YearMonth
  note: string
}

export function emptyRecurringInput(today: ISODate, walletId = ''): RecurringInput {
  return { type: 'gasto', amount: 0, category: '', day: Number(today.slice(8, 10)), walletId, start: ymOf(today), note: '' }
}

export function recurringToInput(r: Recurring): RecurringInput {
  return { type: r.type, amount: r.amount, category: r.category, day: r.day, walletId: r.walletId, start: r.start, note: r.note || '' }
}

export function checkRecurring(i: RecurringInput, today: ISODate, walletIds: string[]): string | null {
  if (!walletIds.length) return 'Crie uma carteira primeiro.'
  if (!(i.amount > 0) || !isFinite(i.amount)) return 'Informe o valor.'
  if (!i.category.trim()) return 'Informe uma categoria.'
  if (!(Number.isInteger(i.day) && i.day >= 1 && i.day <= 31)) return 'Use um dia entre 1 e 31.'
  if (!walletIds.includes(i.walletId)) return 'Escolha uma carteira.'
  if (!/^\d{4}-\d{2}$/.test(i.start)) return 'Informe o mês de início.'
  if (i.start < ymAdd(ymOf(today), -12)) return 'Comece no máximo 12 meses atrás.'
  return null
}

export function createRecurring(i: RecurringInput, id = newRecId()): Recurring {
  return {
    id, type: i.type, amount: round2(i.amount), category: i.category.trim(), day: i.day, walletId: i.walletId, start: i.start,
    note: i.note.trim(), active: true, posted: {},
  }
}

export function updateRecurring(r: Recurring, i: RecurringInput): Recurring {
  return {
    ...r, type: i.type, amount: round2(i.amount), category: i.category.trim(), day: i.day, walletId: i.walletId, start: i.start,
    note: i.note.trim(),
  }
}

/**
 * "Repetir todo mês" no lançamento novo: cria o recorrente já com o mês do lançamento marcado como feito
 * (o lançamento carrega `auto: 'rec:<id>:<mês>'`, igual ao antigo ~l.4308).
 */
export function recurringFromTx(tx: Transaction, id = newRecId()): { rec: Recurring; tx: Transaction } {
  const k = ymOf(tx.date)
  const rec: Recurring = {
    id, type: tx.type === 'entrada' ? 'entrada' : 'gasto', amount: tx.amount, category: tx.category || '', note: tx.note || '',
    day: Number(tx.date.slice(8, 10)), walletId: tx.walletId, start: k, active: true, posted: { [k]: tx.id },
  }
  return { rec, tx: { ...tx, auto: 'rec:' + id + ':' + k } }
}

export function sortedRecurring(list: Recurring[]): Recurring[] {
  return list.slice().sort((a, b) => a.day - b.day)
}
