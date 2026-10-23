import type { AppData, Bill, Card, CardPurchase, ISODate, Transaction, YearMonth } from '@/lib/types'
import { EPS, daysFrom, round2, ymAdd, ymOf } from './dates'
import { billApplies, billStatus, cardInvoices, cardUsed, type Invoice, type InvoiceStatus } from './bills-cards'
import { normTxt } from './people'

// Tela Contas: contas fixas + faturas de cartão de um mês.
// Fonte: renderContasPage (app.js ~l.3327), billTxOf ~l.3059, billStatus ~l.3052,
// cardInvoices ~l.3160, cardUsed ~l.3200. Tudo puro: `today` sempre como parâmetro.

/** situação de uma linha da lista (o "embreve" do antigo vira texto: "vence em 3 dias") */
export type ContaStatus = 'paga' | 'atrasada' | 'hoje' | 'pendente' | 'vazia'

export type ContaFilter = 'todas' | 'pendentes' | 'pagas' | 'atrasadas'
export const CONTA_FILTERS: ContaFilter[] = ['todas', 'pendentes', 'pagas', 'atrasadas']

export type ContaKind = 'fixa' | 'fatura'

export interface ContaRow {
  /** id da rota: `fixa-<id da conta>` ou `cartao-<id do cartão>` */
  id: string
  kind: ContaKind
  name: string
  /** categoria (conta fixa) — entra na busca */
  category?: string
  due: ISODate
  status: ContaStatus
  /** receita fixa (bill.kind 'entrada'): fica na lista, fora das medidas de "a pagar" */
  income: boolean
  /** valor do mês: conta fixa = valor lançado ao pagar (ou o cadastrado); fatura = total */
  amount: number
  /** o que falta pagar (0 se paga) */
  open: number
  /** pago no mês (conta: valor lançado; fatura: soma dos pagamentos) */
  paid: number
  paidDate?: ISODate
  /** dias até o vencimento (negativo = atrasada) */
  diff: number
  walletId?: string
  invoiceStatus?: InvoiceStatus
  /** saldo da fatura anterior que entrou nesta (negativo = crédito) */
  carry?: number
  /** saldo desta fatura que passou para a seguinte */
  rolled?: number
}

export const billRouteId = (id: string) => 'fixa-' + id
export const cardRouteId = (id: string) => 'cartao-' + id

export function parseRouteId(id: string): { kind: ContaKind; refId: string } | null {
  if (id.startsWith('fixa-') && id.length > 5) return { kind: 'fixa', refId: id.slice(5) }
  if (id.startsWith('cartao-') && id.length > 7) return { kind: 'fatura', refId: id.slice(7) }
  return null
}

/** billTxOf (~l.3059): a transação gerada ao marcar como paga (o mapa guarda o id, ou 'x' sem carteira) */
export function billTx(b: Bill, key: YearMonth, transactions: Transaction[]): Transaction | undefined {
  const id = b.paid?.[key]
  return id && id !== 'x' ? transactions.find((t) => t.id === id) : undefined
}

export function billRow(b: Bill, key: YearMonth, data: Pick<AppData, 'transactions'>, today: ISODate): ContaRow {
  const st = billStatus(b, key, today)
  const tx = billTx(b, key, data.transactions)
  // como o antigo: pago = valor da transação lançada; sem transação = valor cadastrado
  const amount = tx ? tx.amount : b.amount
  const paid = st.st === 'paga'
  const diff = daysFrom(today, st.due)
  return {
    id: billRouteId(b.id), kind: 'fixa', name: b.name, category: b.category || undefined, due: st.due,
    status: paid ? 'paga' : diff < 0 ? 'atrasada' : diff === 0 ? 'hoje' : 'pendente',
    income: b.kind === 'entrada', amount, open: paid ? 0 : amount, paid: paid ? amount : 0,
    paidDate: tx?.date, diff, walletId: tx?.walletId || b.walletId || undefined,
  }
}

export function invoiceRow(card: Card, it: Invoice, today: ISODate): ContaRow {
  const due = it.due!
  const diff = daysFrom(today, due)
  const st = it.status!
  const balance = it.balance ?? 0
  const lastPay = it.payments.map((p) => p.date).filter((d): d is string => !!d).sort().pop()
  return {
    id: cardRouteId(card.id), kind: 'fatura', name: card.name, due,
    status: st === 'vazia' ? 'vazia' : st === 'paga' ? 'paga' : st === 'atrasada' ? 'atrasada' : diff === 0 ? 'hoje' : 'pendente',
    income: false, amount: it.total ?? 0, open: balance > EPS ? balance : 0, paid: it.paid,
    paidDate: lastPay, diff, walletId: card.walletId, invoiceStatus: st, carry: it.carry, rolled: it.rolled,
  }
}

const byDue = (a: ContaRow, b: ContaRow) =>
  a.due < b.due ? -1 : a.due > b.due ? 1 : a.name.localeCompare(b.name, 'pt-BR')

/** Uma linha por conta fixa vigente no mês e uma por cartão (fatura com a chave do mês). Ordem: vencimento, nome. */
export function contasRows(data: AppData, key: YearMonth, today: ISODate): ContaRow[] {
  const rows: ContaRow[] = []
  for (const b of data.bills) if (billApplies(b, key)) rows.push(billRow(b, key, data, today))
  for (const card of data.cards) rows.push(invoiceRow(card, cardInvoices(data, card, today).get(key), today))
  return rows.sort(byDue)
}

export function matchesConta(r: ContaRow, f: ContaFilter): boolean {
  if (f === 'todas') return true
  if (f === 'pagas') return r.status === 'paga'
  if (f === 'atrasadas') return r.status === 'atrasada'
  // pendentes = tudo que ainda falta pagar, inclusive as atrasadas
  return r.status === 'pendente' || r.status === 'hoje' || r.status === 'atrasada'
}

export function matchesContaQuery(r: ContaRow, query: string): boolean {
  const q = normTxt(query.trim())
  if (!q) return true
  return normTxt(r.name).includes(q) || normTxt(r.category).includes(q) || (r.kind === 'fatura' && 'fatura cartao'.includes(q))
}

export function filterContas(rows: ContaRow[], f: ContaFilter, query: string): ContaRow[] {
  return rows.filter((r) => matchesConta(r, f) && matchesContaQuery(r, query))
}

export function contaCounts(rows: ContaRow[], query: string): Record<ContaFilter, number> {
  const q = rows.filter((r) => matchesContaQuery(r, query))
  const out = { todas: 0, pendentes: 0, pagas: 0, atrasadas: 0 } as Record<ContaFilter, number>
  for (const f of CONTA_FILTERS) out[f] = q.filter((r) => matchesConta(r, f)).length
  return out
}

export interface ContasTotals {
  /** gastos fixos não pagos + saldo em aberto das faturas do mês (inclui atrasadas) */
  toPay: number
  /** gastos fixos pagos + pagamentos das faturas do mês */
  paid: number
  /** parte de `toPay` já vencida */
  late: number
  /** receitas fixas do mês (recebidas + a receber) */
  income: number
  incomeOpen: number
}

export function contasTotals(rows: ContaRow[]): ContasTotals {
  const t: ContasTotals = { toPay: 0, paid: 0, late: 0, income: 0, incomeOpen: 0 }
  for (const r of rows) {
    if (r.income) {
      t.income += r.amount
      t.incomeOpen += r.open
      continue
    }
    t.toPay += r.open
    t.paid += r.paid
    if (r.status === 'atrasada') t.late += r.open
  }
  return { toPay: round2(t.toPay), paid: round2(t.paid), late: round2(t.late), income: round2(t.income), incomeOpen: round2(t.incomeOpen) }
}

/** Meses navegáveis: do primeiro dado (início da conta, mês pago, fatura) até 12 meses à frente de hoje. */
export function contasMonthRange(data: AppData, today: ISODate): { min: YearMonth; max: YearMonth } {
  const now = ymOf(today)
  let min = now
  let max = ymAdd(now, 12)
  const see = (k: string | undefined) => {
    if (!k || !/^\d{4}-\d{2}$/.test(k)) return
    if (k < min) min = k
  }
  for (const b of data.bills) {
    see(b.startMonth)
    for (const k of Object.keys(b.paid || {})) see(k)
  }
  for (const card of data.cards) {
    const keys = Object.keys(cardInvoices(data, card, today).map).sort()
    see(keys[0])
    const last = keys[keys.length - 1]
    if (last && last > max) max = last
  }
  return { min, max }
}

// ---------------------------------------------------------------- detalhe: conta fixa

export interface BillMonth {
  key: YearMonth
  row: ContaRow
}

export interface BillDetail {
  bill: Bill
  /** meses em que a conta vale, do mais recente ao mais antigo (no máx. 36) */
  months: BillMonth[]
  paidCount: number
  paidTotal: number
}

/**
 * Histórico mês a mês: do `startMonth` (ou do mês pago mais antigo, ou de 11 meses antes do fim)
 * até o mais tardio entre hoje e o mês aberto, limitado pelo `endMonth`.
 */
export function billDetail(data: AppData, billId: string, selected: YearMonth, today: ISODate): BillDetail | null {
  const bill = data.bills.find((b) => b.id === billId)
  if (!bill) return null
  const now = ymOf(today)
  let end = selected > now ? selected : now
  if (bill.endMonth && bill.endMonth < end) end = bill.endMonth
  const paidKeys = Object.keys(bill.paid || {}).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort()
  let start = bill.startMonth || paidKeys[0] || ymAdd(end, -11)
  if (paidKeys[0] && paidKeys[0] < start) start = paidKeys[0]
  if (start < ymAdd(end, -35)) start = ymAdd(end, -35)
  const months: BillMonth[] = []
  // `active: false` some de todo mês (como o antigo); o histórico mostra os meses pagos mesmo assim
  const applies = (k: YearMonth) => billApplies({ ...bill, active: true }, k)
  for (let k = end; k >= start; k = ymAdd(k, -1)) {
    if (!applies(k)) continue
    if (bill.active === false && !bill.paid?.[k]) continue
    months.push({ key: k, row: billRow(bill, k, data, today) })
  }
  const paid = months.filter((m) => m.row.status === 'paga')
  return { bill, months, paidCount: paid.length, paidTotal: round2(paid.reduce((s, m) => s + m.row.paid, 0)) }
}

// ---------------------------------------------------------------- detalhe: fatura

export interface InvoiceItemView {
  key: string
  label: string
  date: ISODate
  category?: string
  /** parcela 1-based e total de parcelas */
  n: number
  i: number
  value: number
  /** valor total da compra */
  purchaseTotal: number
}

export interface CardDetail {
  card: Card
  invoice: Invoice
  row: ContaRow
  items: InvoiceItemView[]
  used: number
  limit: number
  available: number
  usedPct: number | null
  /** faturas com algo (compras, pagamentos ou saldo), da mais recente à mais antiga */
  history: { key: YearMonth; row: ContaRow }[]
}

/** descrição da compra: o antigo grava `desc`; importados podem ter só categoria */
export const purchaseLabel = (p: CardPurchase) =>
  [p.desc, p.note, p.category].map((v) => (typeof v === 'string' ? v.trim() : '')).find(Boolean) || 'Compra'

export function cardDetail(data: AppData, cardId: string, key: YearMonth, today: ISODate): CardDetail | null {
  const card = data.cards.find((c) => c.id === cardId)
  if (!card) return null
  const all = cardInvoices(data, card, today)
  const invoice = all.get(key)
  const items = invoice.items
    .map((x) => ({
      key: x.p.id + ':' + x.i, label: purchaseLabel(x.p), date: x.p.date, category: x.p.category || undefined,
      n: x.n, i: x.i + 1, value: x.value, purchaseTotal: x.p.amount,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const used = cardUsed(data, card)
  const limit = card.limit > 0 ? card.limit : 0
  const history = Object.values(all.map)
    .filter((it) => it.total !== undefined && it.status !== 'vazia')
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .map((it) => ({ key: it.key, row: invoiceRow(card, it, today) }))
  return {
    card, invoice, row: invoiceRow(card, invoice, today), items, used, limit,
    available: round2(limit - used), usedPct: limit > 0 ? Math.min(100, (used / limit) * 100) : null, history,
  }
}
