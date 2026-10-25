import type { AppData, Card, ISODate, YearMonth } from '@/lib/types'
import { EPS, daysInMonth, parseISO, round2, ymAdd, ymOf } from './dates'
import { billApplies, billStatus, cardInvoices, cardUsed, invoiceDates, invoiceKeyFor, splitEqual } from './bills-cards'
import { makeDebtCalc } from './debts'
import { monthSpending } from './reports'
import { totalWalletsBalance } from './wallets'
import { MONTHS } from '@/lib/format'

// "Cabe no mês?": previsão do saldo no fim de cada mês e simulação de uma compra.
// Portado do app antigo: monthForecast ~5500, monthPlan ~7090, simulatePurchase ~7157.

const ymDiff = (a: YearMonth, b: YearMonth) => +a.slice(0, 4) * 12 + +a.slice(5, 7) - (+b.slice(0, 4) * 12 + +b.slice(5, 7))

/** "out/26" */
export const ymShort = (key: YearMonth) => `${MONTHS[+key.slice(5, 7) - 1].slice(0, 3)}/${key.slice(2, 4)}`

/** a recorrente ainda vai lançar neste mês? */
function recurringPending(r: NonNullable<AppData['recurring']>[number], key: YearMonth): boolean {
  if (r.active === false || (r.posted && r.posted[key]) || !r.start || r.start > key || (r.end && r.end < key)) return false
  return true
}

/** média dos gastos do dia a dia (sem contas fixas e cartão) dos 3 meses anteriores a `key` */
function dailyAverage(data: AppData, key: YearMonth): { avg: number; months: number } {
  let sum = 0
  let n = 0
  for (let i = 1; i <= 3; i++) {
    const sp = monthSpending(data, ymAdd(key, -i))
    if (sp.total > 0) {
      sum += sp.other
      n++
    }
  }
  return { avg: n ? sum / n : 0, months: n }
}

/** o que se espera entrar e sair em um mês futuro (monthPlan ~7090) */
export function monthPlan(data: AppData, key: YearMonth, today: ISODate): { in: number; out: number } {
  const calc = makeDebtCalc(today)
  const y = +key.slice(0, 4)
  const m = +key.slice(5, 7) - 1
  let inn = 0
  let out = 0
  for (const d of data.debts) {
    if (calc.isPaid(d)) continue
    const v = calc.openInMonth(d, y, m)
    if (d.kind === 'payable') out += v
    else inn += v
  }
  for (const b of data.bills) {
    if (!billApplies(b, key) || billStatus(b, key, today).st === 'paga') continue
    if (b.kind === 'entrada') inn += b.amount
    else out += b.amount
  }
  for (const card of data.cards) {
    const all = cardInvoices(data, card, today)
    for (const k of [ymAdd(key, -1), key]) {
      const it = all.get(k)
      if (ymOf(it.due!) === key && (it.balance ?? 0) > EPS && !it.rolled) out += it.balance!
    }
  }
  for (const r of data.recurring ?? []) {
    if (!recurringPending(r, key)) continue
    if (r.type === 'entrada') inn += r.amount
    else out += r.amount
  }
  out += dailyAverage(data, ymOf(today)).avg
  return { in: inn, out }
}

export interface ForecastRow {
  label: string
  value: number
}

export interface Forecast {
  start: number
  rows: ForecastRow[]
  end: number
  month: string
  avgMonths: number
}

/** saldo previsto para o fim do mês atual (monthForecast ~5500) */
export function monthForecast(data: AppData, today: ISODate): Forecast {
  const calc = makeDebtCalc(today)
  const key = ymOf(today)
  const y = +key.slice(0, 4)
  const m = +key.slice(5, 7) - 1
  const rows: ForecastRow[] = []
  const start = round2(totalWalletsBalance(data))
  const add = (label: string, v: number) => {
    if (Math.abs(v) > EPS) rows.push({ label, value: round2(v) })
  }
  let rec = 0
  let recLate = 0
  let pay = 0
  for (const d of data.debts) {
    if (calc.isPaid(d)) continue
    const v = calc.openInMonth(d, y, m)
    if (d.kind === 'payable') pay += v
    else {
      rec += v
      recLate += calc.overdueAmount(d)
    }
  }
  add('A receber de empréstimos' + (recLate > EPS ? ' (parte atrasada)' : ''), rec)
  add('Dívidas que eu pago', -pay)
  let billOut = 0
  let billIn = 0
  for (const b of data.bills) {
    if (!billApplies(b, key) || billStatus(b, key, today).st === 'paga') continue
    if (b.kind === 'entrada') billIn += b.amount
    else billOut += b.amount
  }
  add('Receitas fixas que faltam', billIn)
  add('Contas fixas que faltam', -billOut)
  let inv = 0
  for (const card of data.cards) {
    const all = cardInvoices(data, card, today)
    for (const k of [ymAdd(key, -2), ymAdd(key, -1), key, ymAdd(key, 1)]) {
      const it = all.get(k)
      if ((it.balance ?? 0) > EPS && !it.rolled && ymOf(it.due!) <= key) inv += it.balance!
    }
  }
  add('Faturas do cartão', -inv)
  let recIn = 0
  let recOut = 0
  for (const r of data.recurring ?? []) {
    if (!recurringPending(r, key)) continue
    if (r.type === 'entrada') recIn += r.amount
    else recOut += r.amount
  }
  add('Recorrentes que ainda entram', recIn)
  add('Recorrentes que ainda saem', -recOut)
  // gastos do dia a dia: média dos 3 meses anteriores, proporcional aos dias que faltam
  const { avg, months } = dailyAverage(data, key)
  const dim = daysInMonth(y, m)
  const left = dim - parseISO(today).getDate()
  const spentNow = monthSpending(data, key).other
  const daily = Math.max(0, avg - spentNow) > 0 ? Math.min((avg / dim) * left, Math.max(0, avg - spentNow)) : 0
  add('Gastos do dia a dia (média)', -daily)
  const end = round2(rows.reduce((s, r) => s + r.value, start))
  return { start, rows, end, month: MONTHS[m], avgMonths: months }
}

export type FitsMethod = { kind: 'card'; id: string } | { kind: 'wallet'; id: string }
export type Verdict = 'ok' | 'tight' | 'no'

export interface FitsRow {
  key: YearMonth
  without: number
  cost: number
  with: number
}

export interface FitsResult {
  rows: FitsRow[]
  verdict: Verdict
  minWith: number
  minKey: YearMonth | null
  /** aviso de limite do cartão (vazio se coube) */
  limitMsg: string
  parcel: number
  firstKey: YearMonth
  card: Card | null
  /** limite disponível do cartão (só para montar a mensagem) */
  available?: number
}

/** a compra de `amount` em `n` parcelas cabe no orçamento dos próximos meses? (simulatePurchase ~7157) */
export function simulatePurchase(data: AppData, today: ISODate, amount: number, n: number, method: FitsMethod): FitsResult {
  const nowKey = ymOf(today)
  const parcel = splitEqual(amount, n)
  let firstKey = nowKey
  const card = method.kind === 'card' ? (data.cards.find((c) => c.id === method.id) ?? null) : null
  if (card) firstKey = ymOf(invoiceDates(card, invoiceKeyFor(card, today)).due)
  const horizon = Math.max(3, Math.min(12, ymDiff(firstKey, nowKey) + n + 1))
  const rows: FitsRow[] = []
  let base = monthForecast(data, today).end
  let extra = 0
  let minWith = Infinity
  let minKey: YearMonth | null = null
  for (let i = 0; i < horizon; i++) {
    const key = ymAdd(nowKey, i)
    if (i > 0) {
      const pl = monthPlan(data, key, today)
      base = round2(base + pl.in - pl.out)
    }
    const idx = ymDiff(key, firstKey)
    const cost = idx >= 0 && idx < n ? parcel[idx] : 0
    extra = round2(extra + cost)
    const withP = round2(base - extra)
    if (withP < minWith) {
      minWith = withP
      minKey = key
    }
    rows.push({ key, without: base, cost, with: withP })
  }
  const avgOut = monthPlan(data, ymAdd(nowKey, 1), today).out
  const margin = Math.max(200, avgOut * 0.1)
  let verdict: Verdict = minWith >= margin ? 'ok' : minWith >= 0 ? 'tight' : 'no'
  let limitMsg = ''
  let available: number | undefined
  if (card && card.limit > 0) {
    available = round2(card.limit - cardUsed(data, card))
    if (amount > available) {
      limitMsg = `Passa do limite do ${card.name}.`
      verdict = 'no'
    }
  }
  return { rows, verdict, minWith, minKey, limitMsg, parcel: parcel[0], firstKey, card, available }
}
