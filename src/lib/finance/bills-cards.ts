import type { AppData, Bill, Card, CardPayment, CardPurchase, ISODate, YearMonth } from '@/lib/types'
import { EPS, dayIn, daysFrom, round2, ymAdd, ymOf } from './dates'

// Contas fixas e cartões (app.js ~l.3034-3205)

/** divide sem perder centavo: 100 / 3 = 33,34 + 33,33 + 33,33 */
export function splitEqual(total: number, count: number): number[] {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / count)
  const extra = cents - base * count
  const shares: number[] = []
  for (let i = 0; i < count; i++) shares.push((base + (i < extra ? 1 : 0)) / 100)
  return shares
}

export function billApplies(b: Bill, key: YearMonth): boolean {
  return b.active !== false && (!b.startMonth || key >= b.startMonth) && (!b.endMonth || key <= b.endMonth)
}

export type BillSt = 'paga' | 'atrasada' | 'embreve' | 'aberta'

export function billStatus(b: Bill, key: YearMonth, today: ISODate): { st: BillSt; due: ISODate; diff?: number } {
  const due = dayIn(key, b.dueDay)
  if (b.paid && b.paid[key]) return { st: 'paga', due }
  const diff = daysFrom(today, due)
  return { st: diff < 0 ? 'atrasada' : diff <= 7 ? 'embreve' : 'aberta', due, diff }
}

export function invoiceKeyFor(card: Card, iso: ISODate): YearMonth {
  const key = ymOf(iso)
  return iso > dayIn(key, card.closingDay) ? ymAdd(key, 1) : key
}

export function invoiceDates(card: Card, key: YearMonth) {
  const dueKey = card.dueDay > card.closingDay ? key : ymAdd(key, 1)
  return { close: dayIn(key, card.closingDay), due: dayIn(dueKey, card.dueDay) }
}

/**
 * Limite usado (cardUsed, app.js ~l.3200): todas as compras menos todos os pagamentos, nunca
 * negativo. Conta a compra parcelada inteira, inclusive parcelas de faturas futuras.
 */
export function cardUsed(data: Pick<AppData, 'cardPurchases' | 'cardPayments'>, card: Card): number {
  let pur = 0
  let pay = 0
  for (const p of data.cardPurchases) if (p.cardId === card.id) pur += p.amount
  for (const x of data.cardPayments) if (x.cardId === card.id) pay += x.amount
  return Math.max(0, round2(pur - pay))
}

export type InvoiceStatus = 'vazia' | 'paga' | 'atrasada' | 'fechada' | 'aberta'

export interface Invoice {
  key: YearMonth
  items: { p: CardPurchase; i: number; n: number; value: number }[]
  charges: number
  paid: number
  payments: CardPayment[]
  close?: ISODate
  due?: ISODate
  carry?: number
  total?: number
  balance?: number
  status?: InvoiceStatus
  /** saldo que não foi pago até o vencimento e passou para a fatura seguinte */
  rolled?: number
}

/** todas as faturas do cartão; o que não foi pago até o vencimento vai para a fatura seguinte */
export function cardInvoices(data: Pick<AppData, 'cardPurchases' | 'cardPayments'>, card: Card, today: ISODate) {
  const map: Record<string, Invoice> = {}
  const inv = (k: YearMonth) => map[k] || (map[k] = { key: k, items: [], charges: 0, paid: 0, payments: [] })
  for (const p of data.cardPurchases) {
    if (p.cardId !== card.id) continue
    const n = Math.max(1, parseInt(String(p.installments), 10) || 1)
    const first = invoiceKeyFor(card, p.date)
    const parts = splitEqual(p.amount, n)
    for (let i = 0; i < n; i++) {
      const it = inv(ymAdd(first, i))
      it.items.push({ p, i, n, value: parts[i] })
      it.charges = round2(it.charges + parts[i])
    }
  }
  for (const x of data.cardPayments) {
    if (x.cardId !== card.id) continue
    const it = inv(x.invoice)
    it.paid = round2(it.paid + x.amount)
    it.payments.push(x)
  }
  const fill = (it: Invoice, c: number) => {
    const dt = invoiceDates(card, it.key)
    it.close = dt.close
    it.due = dt.due
    it.carry = c
    it.total = round2(it.charges + c)
    it.balance = round2(it.total - it.paid)
    it.status =
      it.total <= EPS && it.paid <= EPS ? 'vazia'
      : it.balance <= EPS ? 'paga'
      : today > it.due ? 'atrasada'
      : today > it.close ? 'fechada'
      : 'aberta'
  }
  const keys = Object.keys(map).sort()
  const nowKey = ymOf(today)
  if (keys.length) {
    let k = keys[0]
    const last = keys[keys.length - 1] > nowKey ? keys[keys.length - 1] : nowKey
    let carry = 0
    while (k <= last) {
      const it = inv(k)
      fill(it, carry)
      carry = today > it.due! && Math.abs(it.balance!) > EPS ? it.balance! : 0
      if (carry > 0) it.rolled = carry
      k = ymAdd(k, 1)
    }
  }
  return {
    map,
    get(key: YearMonth): Invoice {
      const it = inv(key)
      if (it.total === undefined) fill(it, 0)
      return it
    },
  }
}
