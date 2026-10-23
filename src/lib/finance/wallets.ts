import type { AppData, Card, ISODate, Wallet, YearMonth } from '@/lib/types'
import { EPS, parseISO, round2, ymAdd, ymOf } from './dates'
import { cardInvoices, cardUsed, type InvoiceStatus } from './bills-cards'

// Saldo das carteiras (walletEvents/walletBalance/totalWalletsBalance, app.js ~l.127-157)

export interface WalletEvent {
  /** chave única na carteira (id do lançamento + lado, ou dívida + índice do pagamento) */
  key: string
  date: ISODate
  amount: number
  kind: 'entrada' | 'gasto'
  label: string
  note?: string
  isLoan: boolean
  isTransfer: boolean
  /** só lançamentos comuns: a categoria original (o rótulo cai em "Gasto"/"Entrada" sem ela) */
  category?: string
}

export function walletEvents(data: AppData, walletId: string): WalletEvent[] {
  const events: WalletEvent[] = []
  const wn = (id?: string) => data.wallets.find((x) => x.id === id)?.name ?? 'carteira excluída'
  data.transactions.forEach((t, ti) => {
    const id = t.id ?? 'i' + ti
    const note = t.note || undefined
    if (t.type === 'transferencia') {
      if (t.walletId === walletId)
        events.push({ key: 't:' + id + ':out', date: t.date, amount: t.amount, kind: 'gasto', label: 'Transferência para ' + wn(t.toWalletId), note, isLoan: false, isTransfer: true })
      if (t.toWalletId === walletId)
        events.push({ key: 't:' + id + ':in', date: t.date, amount: t.amount, kind: 'entrada', label: 'Transferência de ' + wn(t.walletId), note, isLoan: false, isTransfer: true })
      return
    }
    if (t.walletId === walletId)
      events.push({
        key: 't:' + id, date: t.date, amount: t.amount, kind: t.type === 'gasto' ? 'gasto' : 'entrada',
        label: t.category || (t.type === 'gasto' ? 'Gasto' : 'Entrada'), note, isLoan: false, isTransfer: false,
        category: t.category || undefined,
      })
  })
  for (const d of data.debts) {
    ;(d.payments || []).forEach((p, pi) => {
      if (p.walletId === walletId)
        events.push({
          key: 'p:' + d.id + ':' + pi, date: p.date, amount: p.amount, kind: d.kind === 'payable' ? 'gasto' : 'entrada',
          label: (d.kind === 'payable' ? 'Pagamento para ' : 'Recebido de ') + d.name, note: p.note || undefined, isLoan: true, isTransfer: false,
        })
    })
  }
  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

const signed = (e: WalletEvent) => (e.kind === 'entrada' ? e.amount : -e.amount)

export function walletBalance(data: AppData, walletId: string): number {
  return walletEvents(data, walletId).reduce((sum, e) => sum + signed(e), 0)
}

export function totalWalletsBalance(data: AppData): number {
  return data.wallets.reduce((sum, w) => sum + walletBalance(data, w.id), 0)
}

/**
 * Entrou / saiu no mês (renderDashboard, app.js ~l.4021). Ignora transferências.
 * DIFERENÇA DELIBERADA: o antigo usa `new Date('YYYY-MM-DD')`, que o JS lê como UTC; no Brasil
 * (UTC-3) um lançamento do dia 1º cai no mês anterior. Aqui a data é lida em horário local.
 */
export function monthInOut(data: AppData, y: number, m: number) {
  let monthIn = 0
  let monthOut = 0
  for (const w of data.wallets) {
    for (const e of walletEvents(data, w.id)) {
      const dt = parseISO(e.date)
      if (!e.isTransfer && dt.getFullYear() === y && dt.getMonth() === m) {
        if (e.kind === 'entrada') monthIn += e.amount
        else monthOut += e.amount
      }
    }
  }
  return { monthIn, monthOut, net: monthIn - monthOut }
}

/**
 * Saldo acumulado dia a dia (base do gráfico de evolução, renderEvoChart ~l.4040).
 * Com `walletId`, só daquela carteira (gráfico do detalhe da carteira).
 */
export function balanceSeries(data: AppData, fromISO: ISODate, toISO_: ISODate, walletId?: string) {
  const deltas = new Map<ISODate, number>()
  let before = 0
  const wallets = walletId ? data.wallets.filter((w) => w.id === walletId) : data.wallets
  for (const w of wallets) {
    for (const e of walletEvents(data, w.id)) {
      const v = signed(e)
      if (e.date < fromISO) before += v
      else if (e.date <= toISO_) deltas.set(e.date, (deltas.get(e.date) ?? 0) + v)
    }
  }
  const out: { date: ISODate; total: number }[] = []
  let cum = before
  const cur = parseISO(fromISO)
  const end = parseISO(toISO_)
  while (cur <= end) {
    const iso = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0')
    cum += deltas.get(iso) ?? 0
    out.push({ date: iso, total: Math.round(cum * 100) / 100 })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

// ---------------------------------------------------------------- tela Carteiras

/**
 * Tipo da carteira em texto. O app antigo não tem campo "tipo": só o ícone escolhido
 * (WALLET_ICONS, app.js ~l.69). O rótulo é deduzido dele; ícone desconhecido → "Carteira".
 */
const KIND_BY_ICON: Record<string, string> = {
  'credit-card': 'Cartão',
  landmark: 'Banco',
  building: 'Banco',
  vault: 'Cofre',
  banknote: 'Dinheiro',
  coins: 'Dinheiro',
  'piggy-bank': 'Poupança',
  smartphone: 'Conta digital',
  briefcase: 'Trabalho',
}
export function walletKindLabel(icon: string | undefined): string {
  return (icon && KIND_BY_ICON[icon]) || 'Carteira'
}

export interface WalletCardInfo {
  card: Card
  /** fatura do mês corrente (mesma chave que a aba Cartões do antigo usa ao abrir: o mês de hoje) */
  invoiceKey: YearMonth
  invoiceTotal: number
  /** o que falta pagar da fatura (negativo = crédito) */
  invoiceBalance: number
  invoiceStatus: InvoiceStatus
  due: ISODate
  used: number
  limit: number
  /** 0–100, ou null sem limite cadastrado */
  usedPct: number | null
}

/** Cartões cuja fatura é paga por esta carteira (`card.walletId`, "Pagar a fatura com" ~l.3216). */
export function walletCards(data: AppData, walletId: string, today: ISODate): WalletCardInfo[] {
  const key = ymOf(today)
  return data.cards.filter((c) => c.walletId === walletId).map((card) => {
    const it = cardInvoices(data, card, today).get(key)
    const used = cardUsed(data, card)
    const limit = card.limit > 0 ? card.limit : 0
    return {
      card, invoiceKey: key, invoiceTotal: it.total ?? 0, invoiceBalance: it.balance ?? 0,
      invoiceStatus: it.status ?? 'vazia', due: it.due!, used, limit,
      usedPct: limit > 0 ? Math.min(100, (used / limit) * 100) : null,
    }
  })
}

export interface WalletRow {
  wallet: Wallet
  kind: string
  balance: number
  count: number
  lastDate?: ISODate
  cards: WalletCardInfo[]
}

/** Uma linha por carteira, na ordem em que o antigo as guarda (renderWalletsPage ~l.4061). */
export function buildWalletRows(data: AppData, today: ISODate): WalletRow[] {
  return data.wallets.map((wallet) => {
    const ev = walletEvents(data, wallet.id)
    return {
      wallet, kind: walletKindLabel(wallet.icon), balance: round2(ev.reduce((s, e) => s + signed(e), 0)),
      count: ev.length, lastDate: ev[0]?.date, cards: walletCards(data, wallet.id, today),
    }
  })
}

export type MovementFilter = 'todos' | 'entradas' | 'saidas' | 'transferencias'
export const MOVEMENT_FILTERS: MovementFilter[] = ['todos', 'entradas', 'saidas', 'transferencias']

export function matchesMovement(e: WalletEvent, f: MovementFilter): boolean {
  if (f === 'transferencias') return e.isTransfer
  if (f === 'entradas') return !e.isTransfer && e.kind === 'entrada'
  if (f === 'saidas') return !e.isTransfer && e.kind === 'gasto'
  return true
}

/** meses navegáveis: do primeiro movimento até o mês de hoje (ou o último movimento, se futuro) */
export function walletMonthRange(events: WalletEvent[], today: ISODate): { min: YearMonth; max: YearMonth } {
  const now = ymOf(today)
  if (!events.length) return { min: now, max: now }
  const first = ymOf(events[events.length - 1].date)
  const last = ymOf(events[0].date)
  return { min: first < now ? first : now, max: last > now ? last : now }
}

export const clampMonth = (ym: YearMonth, r: { min: YearMonth; max: YearMonth }) => (ym < r.min ? r.min : ym > r.max ? r.max : ym)

export interface MovementDay {
  date: ISODate
  items: WalletEvent[]
  /** saldo da carteira ao fim do dia (todos os movimentos, ignora o filtro) */
  endBalance: number
}

export interface WalletMonth {
  days: MovementDay[]
  /** entrou / saiu no mês nesta carteira, sem transferências (como monthInOut) */
  monthIn: number
  monthOut: number
  /** movimentos do mês antes do filtro */
  total: number
  shown: number
  /** mês mais recente (≤ hoje, se houver) com movimento que passe no filtro, para "ir para" */
  latestWith?: YearMonth
}

/** Movimentos de um mês agrupados por dia (mais recente primeiro), com saldo ao fim de cada dia. */
export function walletMonth(events: WalletEvent[], ym: YearMonth, f: MovementFilter, today: ISODate): WalletMonth {
  // saldo ao fim de cada data, em ordem cronológica
  const endOf = new Map<ISODate, number>()
  let cum = 0
  for (let i = events.length - 1; i >= 0; i--) {
    cum += signed(events[i])
    endOf.set(events[i].date, round2(cum))
  }
  const inMonth = events.filter((e) => ymOf(e.date) === ym)
  let monthIn = 0
  let monthOut = 0
  for (const e of inMonth) {
    if (e.isTransfer) continue
    if (e.kind === 'entrada') monthIn += e.amount
    else monthOut += e.amount
  }
  const days: MovementDay[] = []
  let shown = 0
  for (const e of inMonth) {
    if (!matchesMovement(e, f)) continue
    shown++
    const last = days[days.length - 1]
    if (last && last.date === e.date) last.items.push(e)
    else days.push({ date: e.date, items: [e], endBalance: endOf.get(e.date) ?? 0 })
  }
  const now = ymOf(today)
  const matching = events.filter((e) => matchesMovement(e, f))
  const latest = matching.find((e) => ymOf(e.date) <= now) ?? matching[matching.length - 1]
  return {
    days, monthIn: round2(monthIn), monthOut: round2(monthOut), total: inMonth.length, shown,
    latestWith: latest ? ymOf(latest.date) : undefined,
  }
}

/** série do gráfico da carteira: do primeiro movimento até hoje (ou o último, se futuro) */
export function walletSeries(data: AppData, walletId: string, today: ISODate) {
  const ev = walletEvents(data, walletId)
  if (!ev.length) return []
  const from = ev[ev.length - 1].date
  const to = ev[0].date > today ? ev[0].date : today
  return balanceSeries(data, from < today ? from : today, to, walletId)
}

/** mês anterior / seguinte dentro do intervalo, ou null */
export function stepMonth(ym: YearMonth, dir: -1 | 1, r: { min: YearMonth; max: YearMonth }): YearMonth | null {
  const n = ymAdd(ym, dir)
  return n < r.min || n > r.max ? null : n
}

export const isZero = (v: number) => Math.abs(v) < EPS
