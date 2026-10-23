import type { AppData, ISODate, YearMonth } from '@/lib/types'
import { EPS, addDaysISO, daysInMonth, round2, ymAdd, ymOf } from './dates'
import { cardInvoices, cardUsed, splitEqual, type InvoiceStatus } from './bills-cards'
import { billTx } from './contas'
import { nameKey, normTxt } from './people'
import { balanceSeries } from './wallets'

// Relatórios: períodos, gastos/entradas por categoria, fluxo mensal, contas fixas × cartão ×
// outros, saldo no tempo, empréstimos por pessoa e faturas por cartão.
// Fontes (app.js antigo): renderRelatorios ~l.3948, renderCategoryBars ~l.3925,
// monthSpending ~l.4536, renderSpendBars ~l.4565, renderMixChart ~l.4666, renderRelCards ~l.4703,
// renderCompare ~l.7384, renderEvoChart ~l.4040. Tudo puro: `today` sempre como parâmetro.

// ---------------------------------------------------------------- períodos

export type ReportPeriod = 'mes' | '3m' | '12m' | 'ano'
export const REPORT_PERIODS: ReportPeriod[] = ['mes', '3m', '12m', 'ano']

export interface MonthRange {
  min: YearMonth
  max: YearMonth
}

export interface ReportRange extends MonthRange {
  /** último mês (até hoje) com algum dado — destino do "ir para" quando o período está vazio */
  last: YearMonth
}

const LEN: Record<Exclude<ReportPeriod, 'ano'>, number> = { mes: 1, '3m': 3, '12m': 12 }

/** meses de `from` a `to`, inclusive */
export function monthsBetween(from: YearMonth, to: YearMonth): YearMonth[] {
  const out: YearMonth[] = []
  for (let k = from; k <= to; k = ymAdd(k, 1)) out.push(k)
  return out
}

/**
 * Meses do período que termina em `anchor`. "ano" = janeiro a dezembro do ano de `anchor`,
 * mas no ano corrente só até o mês de hoje (meses futuros não têm o que mostrar).
 */
export function periodMonths(kind: ReportPeriod, anchor: YearMonth, today: ISODate): YearMonth[] {
  if (kind === 'ano') {
    const y = anchor.slice(0, 4)
    const now = ymOf(today)
    const end = now.slice(0, 4) === y ? now : y + '-12'
    return monthsBetween(y + '-01', end)
  }
  return monthsBetween(ymAdd(anchor, -(LEN[kind] - 1)), anchor)
}

/** período anterior com o mesmo tamanho (ano: os mesmos meses do ano anterior) */
export function previousMonths(kind: ReportPeriod, months: YearMonth[]): YearMonth[] {
  const shift = kind === 'ano' ? -12 : -months.length
  return months.map((m) => ymAdd(m, shift))
}

/** do mês mais antigo com algum dado até o mês de hoje; null se não há nada */
export function reportRange(data: AppData, today: ISODate): ReportRange | null {
  const keys: YearMonth[] = []
  for (const t of data.transactions) if (t && t.type !== 'transferencia' && t.date) keys.push(ymOf(t.date))
  for (const d of data.debts) for (const p of d.payments || []) if (p.date) keys.push(ymOf(p.date))
  for (const b of data.bills) for (const k of Object.keys(b.paid || {})) keys.push(k)
  for (const p of data.cardPurchases) keys.push(ymOf(p.date))
  for (const x of data.cardPayments) keys.push(x.invoice)
  const valid = keys.filter((k) => /^\d{4}-\d{2}$/.test(k))
  if (!valid.length) return null
  const max = ymOf(today)
  const min = valid.reduce((a, b) => (b < a ? b : a))
  const past = valid.filter((k) => k <= max)
  const last = past.length ? past.reduce((a, b) => (b > a ? b : a)) : max
  return { min: min > max ? max : min, max, last }
}

/** âncora dentro do intervalo; no "ano", o ano é limitado aos anos do intervalo */
export function clampAnchor(kind: ReportPeriod, anchor: YearMonth, r: MonthRange): YearMonth {
  if (kind === 'ano') {
    const y = Math.min(Math.max(+anchor.slice(0, 4), +r.min.slice(0, 4)), +r.max.slice(0, 4))
    return y === +r.max.slice(0, 4) ? r.max : y + '-12'
  }
  return anchor < r.min ? r.min : anchor > r.max ? r.max : anchor
}

/** período anterior/seguinte (sem sobrepor); null se sair do intervalo */
export function stepAnchor(kind: ReportPeriod, anchor: YearMonth, dir: -1 | 1, r: MonthRange): YearMonth | null {
  if (kind === 'ano') {
    const y = +anchor.slice(0, 4) + dir
    if (y < +r.min.slice(0, 4) || y > +r.max.slice(0, 4)) return null
    return clampAnchor('ano', y + '-12', r)
  }
  const next = ymAdd(anchor, dir * LEN[kind])
  // anterior: basta o fim do período alcançar o primeiro mês com dados
  if (next > r.max || next < r.min) return null
  return next
}

/** meses mostrados no gráfico de barras: o período, completado para trás até 6 meses (como o antigo) */
export function chartMonths(months: YearMonth[], r: MonthRange | null): { key: YearMonth; inPeriod: boolean }[] {
  if (!months.length) return []
  const out = months.map((key) => ({ key, inPeriod: true }))
  let k = months[0]
  while (out.length < 6) {
    k = ymAdd(k, -1)
    if (r && k < r.min) break
    out.unshift({ key: k, inPeriod: false })
  }
  return out
}

// ---------------------------------------------------------------- gastos e entradas

export interface CatTotal {
  name: string
  amount: number
  /** parte paga no cartão de crédito (só gastos) */
  card: number
}

export interface Spending {
  /** chave = nome da categoria sem acento e em minúsculas */
  byCat: Record<string, CatTotal>
  total: number
  card: number
  bills: number
  other: number
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function emptySpending(): Spending {
  return { byCat: {}, total: 0, card: 0, bills: 0, other: 0 }
}

function addTo(res: Spending, rawCat: string | undefined, v: number, kind: 'card' | 'bills' | 'other') {
  const cat = (rawCat || '').trim() || 'Outros'
  const ck = normTxt(cat)
  const c = res.byCat[ck] || (res.byCat[ck] = { name: cat, amount: 0, card: 0 })
  c.amount = round2(c.amount + v)
  if (kind === 'card') c.card = round2(c.card + v)
  res.total = round2(res.total + v)
  res[kind] = round2(res[kind] + v)
}

/**
 * Gastos do mês (monthSpending ~l.4536): lançamentos de gasto + contas fixas pagas + parcelas de
 * compras no cartão. O lançamento gerado ao pagar fatura/conta fixa (`auto` 'card:'/'bill:') não
 * conta de novo. A parcela do cartão cai no mês da COMPRA + n (não no mês da fatura), como o antigo.
 */
export function monthSpending(data: AppData, key: YearMonth): Spending {
  const res = emptySpending()
  for (const t of data.transactions) {
    if (!t || t.type !== 'gasto' || ymOf(t.date) !== key) continue
    if (t.auto && /^(card|bill):/.test(t.auto)) continue
    addTo(res, t.category, num(t.amount), 'other')
  }
  for (const b of data.bills) {
    if (b.kind === 'entrada' || !b.paid || !b.paid[key]) continue
    const tx = billTx(b, key, data.transactions)
    addTo(res, b.category || b.name, tx ? num(tx.amount) : num(b.amount), 'bills')
  }
  for (const p of data.cardPurchases) {
    const n = Math.max(1, parseInt(String(p.installments), 10) || 1)
    const off = ymDiff(key, ymOf(p.date))
    if (off < 0 || off >= n) continue
    addTo(res, p.category || 'Cartão de crédito', splitEqual(p.amount, n)[off], 'card')
  }
  return res
}

/**
 * Entradas do mês por categoria (renderCategoryBars 'entrada' ~l.3925): só lançamentos de entrada
 * (não conta pagamentos de dívida nem receita fixa marcada sem carteira). Categoria vazia → "Outros"
 * e categorias iguais sem acento/maiúsculas se somam (o antigo separava e mostrava "undefined").
 */
export function monthIncome(data: AppData, key: YearMonth): Spending {
  const res = emptySpending()
  for (const t of data.transactions) {
    if (!t || t.type !== 'entrada' || ymOf(t.date) !== key) continue
    addTo(res, t.category, num(t.amount), 'other')
  }
  return res
}

const ymDiff = (a: YearMonth, b: YearMonth) => +a.slice(0, 4) * 12 + +a.slice(5, 7) - (+b.slice(0, 4) * 12 + +b.slice(5, 7))

/** soma vários meses */
export function sumMonths(list: Spending[]): Spending {
  const res = emptySpending()
  for (const s of list) {
    for (const [k, c] of Object.entries(s.byCat)) {
      const t = res.byCat[k] || (res.byCat[k] = { name: c.name, amount: 0, card: 0 })
      t.amount = round2(t.amount + c.amount)
      t.card = round2(t.card + c.card)
    }
    res.total = round2(res.total + s.total)
    res.card = round2(res.card + s.card)
    res.bills = round2(res.bills + s.bills)
    res.other = round2(res.other + s.other)
  }
  return res
}

export const periodSpending = (data: AppData, months: YearMonth[]) => sumMonths(months.map((k) => monthSpending(data, k)))
export const periodIncome = (data: AppData, months: YearMonth[]) => sumMonths(months.map((k) => monthIncome(data, k)))

export interface PeriodSummary {
  income: number
  spending: number
  net: number
}

/** as três medidas do topo (Entradas / Gastos / Saldo do período, como o antigo) */
export function periodSummary(data: AppData, months: YearMonth[]): PeriodSummary {
  const income = periodIncome(data, months).total
  const spending = periodSpending(data, months).total
  return { income, spending, net: round2(income - spending) }
}

/** variação relativa; null quando a base é zero */
export function pctChange(cur: number, prev: number): number | null {
  if (Math.abs(prev) <= EPS) return null
  return (cur - prev) / Math.abs(prev)
}

export interface CatRow {
  key: string
  name: string
  amount: number
  /** fração do total do período (0–1) */
  share: number
  card: number
  prev: number
  diff: number
}

/** ranking por categoria com a comparação ao período anterior (junta "Comparando os meses") */
export function categoryRanking(cur: Spending, prev: Spending): CatRow[] {
  return Object.entries(cur.byCat)
    .filter(([, c]) => c.amount > EPS)
    .map(([key, c]) => {
      const p = prev.byCat[key]?.amount ?? 0
      return { key, name: c.name, amount: c.amount, share: cur.total > EPS ? c.amount / cur.total : 0, card: c.card, prev: p, diff: round2(c.amount - p) }
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'pt-BR'))
}

// ---------------------------------------------------------------- séries mensais

export interface FlowPoint {
  key: YearMonth
  inPeriod: boolean
  income: number
  spending: number
  net: number
}

export function flowSeries(data: AppData, months: { key: YearMonth; inPeriod: boolean }[]): FlowPoint[] {
  return months.map(({ key, inPeriod }) => {
    const income = monthIncome(data, key).total
    const spending = monthSpending(data, key).total
    return { key, inPeriod, income, spending, net: round2(income - spending) }
  })
}

export interface MixPoint {
  key: YearMonth
  inPeriod: boolean
  bills: number
  card: number
  other: number
  total: number
}

/** contas fixas × cartão × outros gastos, mês a mês (renderMixChart ~l.4666) */
export function mixSeries(data: AppData, months: { key: YearMonth; inPeriod: boolean }[]): MixPoint[] {
  return months.map(({ key, inPeriod }) => {
    const s = monthSpending(data, key)
    return { key, inPeriod, bills: s.bills, card: s.card, other: s.other, total: s.total }
  })
}

// ---------------------------------------------------------------- saldo no tempo

/** último dia do período, sem passar de hoje */
export function periodBounds(months: YearMonth[], today: ISODate): { from: ISODate; to: ISODate } | null {
  if (!months.length) return null
  const from = months[0] + '-01'
  const last = months[months.length - 1]
  const end = last + '-' + String(daysInMonth(+last.slice(0, 4), +last.slice(5, 7) - 1)).padStart(2, '0')
  const to = end > today ? today : end
  return to < from ? null : { from, to }
}

export interface WalletPeriodRow {
  id: string
  name: string
  start: number
  end: number
  change: number
}

/** saldo total dia a dia no período (renderEvoChart ~l.4040, recortado) e cada carteira no início/fim */
export function balanceReport(data: AppData, months: YearMonth[], today: ISODate) {
  const b = periodBounds(months, today)
  if (!b || !data.wallets.length) return { points: [] as { date: ISODate; total: number }[], wallets: [] as WalletPeriodRow[] }
  const points = balanceSeries(data, b.from, b.to)
  const wallets = data.wallets
    .map((w) => {
      const s = balanceSeries(data, b.from, b.to, w.id)
      const end = s.length ? s[s.length - 1].total : 0
      const eve = addDaysISO(b.from, -1)
      const start = balanceSeries(data, eve, eve, w.id)[0]?.total ?? 0
      return { id: w.id, name: w.name, start, end, change: round2(end - start) }
    })
    .sort((a, c) => c.end - a.end || a.name.localeCompare(c.name, 'pt-BR'))
  return { points, wallets }
}

// ---------------------------------------------------------------- empréstimos

export interface LoanPersonRow {
  key: string
  name: string
  /** recebido de quem me devia */
  received: number
  /** pago em dívidas minhas */
  paid: number
}

/** pagamentos de dívidas no período (bloco "Empréstimos no período" ~l.3972), por pessoa */
export function loansByPerson(data: AppData, months: YearMonth[]): { rows: LoanPersonRow[]; received: number; paid: number } {
  const set = new Set(months)
  const by = new Map<string, LoanPersonRow>()
  let received = 0
  let paid = 0
  for (const d of data.debts) {
    for (const p of d.payments || []) {
      if (!p.date || !set.has(ymOf(p.date))) continue
      const v = num(p.amount)
      const k = nameKey(d.name)
      const r = by.get(k) ?? { key: k, name: (d.name || '').trim() || 'Sem nome', received: 0, paid: 0 }
      if (d.kind === 'payable') {
        r.paid = round2(r.paid + v)
        paid += v
      } else {
        r.received = round2(r.received + v)
        received += v
      }
      by.set(k, r)
    }
  }
  const rows = [...by.values()].sort((a, b) => b.received + b.paid - (a.received + a.paid) || a.name.localeCompare(b.name, 'pt-BR'))
  return { rows, received: round2(received), paid: round2(paid) }
}

// ---------------------------------------------------------------- cartões

export interface CardPeriodRow {
  id: string
  name: string
  /** compras que caíram nas faturas do período (sem o saldo que rolou de uma fatura para outra) */
  charges: number
  /** pagamentos lançados nas faturas do período */
  paid: number
  /** fatura do último mês do período */
  lastKey: YearMonth
  lastTotal: number
  lastStatus: InvoiceStatus
  used: number
  limit: number
}

export interface CardMonthPoint {
  key: YearMonth
  inPeriod: boolean
  charges: number
}

/** faturas por cartão (renderRelCards ~l.4703), somando o período, e o total faturado mês a mês */
export function cardsReport(data: AppData, months: YearMonth[], chart: { key: YearMonth; inPeriod: boolean }[], today: ISODate) {
  const set = new Set(months)
  const last = months[months.length - 1]
  const perMonth = new Map<YearMonth, number>()
  const rows: CardPeriodRow[] = data.cards.map((card) => {
    const inv = cardInvoices(data, card, today)
    let charges = 0
    let paid = 0
    for (const it of Object.values(inv.map)) {
      if (set.has(it.key)) {
        charges += it.charges
        paid += it.paid
      }
      perMonth.set(it.key, round2((perMonth.get(it.key) ?? 0) + it.charges))
    }
    const li = inv.get(last)
    return {
      id: card.id, name: card.name, charges: round2(charges), paid: round2(paid), lastKey: last,
      lastTotal: li.total ?? 0, lastStatus: li.status ?? 'vazia', used: cardUsed(data, card), limit: num(card.limit),
    }
  })
  rows.sort((a, b) => b.charges - a.charges || a.name.localeCompare(b.name, 'pt-BR'))
  const series: CardMonthPoint[] = chart.map(({ key, inPeriod }) => ({ key, inPeriod, charges: perMonth.get(key) ?? 0 }))
  return { rows, series, charges: round2(rows.reduce((s, r) => s + r.charges, 0)), paid: round2(rows.reduce((s, r) => s + r.paid, 0)) }
}
