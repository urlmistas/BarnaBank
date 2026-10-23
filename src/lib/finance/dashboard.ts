import type { AppData, ISODate } from '@/lib/types'
import { EPS, addDaysISO, parseISO, toISO, ymAdd, ymOf } from './dates'
import { makeDebtCalc } from './debts'
import { billApplies, billStatus, cardInvoices } from './bills-cards'
import { monthInOut, totalWalletsBalance } from './wallets'

// Dados do Início. Fontes: renderDashboard ~l.4010, renderWeek + weekSources ~l.2208 e ~l.3438,
// renderTodayBanner ~l.4507, renderHomeSide ~l.5561 (app.js antigo).

export type UpcomingSource = 'debt' | 'bill' | 'card'

export interface UpcomingItem {
  key: string
  source: UpcomingSource
  date: ISODate
  title: string
  /** contexto curto: grupo, "conta fixa", "cartão", parcela */
  context: string
  amount: number
  dir: 'in' | 'out'
  late: boolean
  /** rota da aba que mostra o detalhe */
  to: string
}

/** Tudo que vence até `today + days` (inclui atrasados). Mesmo critério do "Hoje e esta semana". */
export function upcomingItems(data: AppData, today: ISODate, days = 7): UpcomingItem[] {
  const limitISO = addDaysISO(today, days)
  const calc = makeDebtCalc(today)
  const out: UpcomingItem[] = []
  const groupTitle = (id?: string) => (id ? data.groups.find((g) => g.id === id)?.title : undefined)

  for (const d of data.debts) {
    if (calc.isPaid(d)) continue
    const due = calc.nextDueDate(d)
    if (!due) continue
    const dueISO = toISO(due)
    if (dueISO > limitISO) continue
    const q = calc.quickPayAmount(d)
    const g = groupTitle(d.groupId)
    out.push({
      key: 'd:' + d.id, source: 'debt', date: dueISO, title: d.name,
      context: g ?? (d.kind === 'payable' ? 'eu devo' : 'empréstimo'),
      amount: q ?? calc.amountDueNow(d), dir: d.kind === 'payable' ? 'out' : 'in',
      late: dueISO < today, to: '/pessoas',
    })
  }

  const cur = ymOf(today)
  const keys = [ymAdd(cur, -1), cur, ymAdd(cur, 1)]
  for (const key of keys) {
    for (const b of data.bills) {
      if (!billApplies(b, key)) continue
      const st = billStatus(b, key, today)
      if (st.st === 'paga' || st.due > limitISO) continue
      out.push({
        key: 'b:' + b.id + ':' + key, source: 'bill', date: st.due, title: b.name,
        context: 'conta fixa', amount: b.amount, dir: b.kind === 'entrada' ? 'in' : 'out',
        late: st.due < today, to: '/contas',
      })
    }
  }
  for (const card of data.cards) {
    const all = cardInvoices(data, card, today)
    for (const key of keys) {
      const it = all.get(key)
      if (!(it.balance! > EPS) || it.due! > limitISO || it.rolled) continue
      out.push({
        key: 'c:' + card.id + ':' + key, source: 'card', date: it.due!, title: 'Fatura ' + card.name,
        context: 'cartão', amount: it.balance!, dir: 'out', late: it.due! < today, to: '/contas',
      })
    }
  }
  // ordenação estável por data, como no antigo
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export interface DashboardAlert {
  tone: 'late' | 'today'
  count: number
  total: number
  names: string[]
}

/** No máximo um alerta: atrasados têm prioridade sobre "vence hoje". */
export function dashboardAlert(items: UpcomingItem[], today: ISODate): DashboardAlert | null {
  const late = items.filter((i) => i.late)
  if (late.length)
    return { tone: 'late', count: late.length, total: late.reduce((s, i) => s + i.amount, 0), names: late.map((i) => i.title) }
  const dueToday = items.filter((i) => i.date === today && !i.late)
  if (dueToday.length)
    return { tone: 'today', count: dueToday.length, total: dueToday.reduce((s, i) => s + i.amount, 0), names: dueToday.map((i) => i.title) }
  return null
}

export interface DashboardSummary {
  balance: number
  walletCount: number
  /** soma do que falta receber em empréstimos (remaining de cada dívida a receber em aberto) */
  toReceive: number
  /** parte de toReceive que já está atrasada */
  toReceiveLate: number
  /** soma do que eu devo */
  toPay: number
  monthIn: number
  monthOut: number
  monthNet: number
  receivablesOpen: number
}

export function dashboardSummary(data: AppData, today: ISODate): DashboardSummary {
  const calc = makeDebtCalc(today)
  let toReceive = 0
  let toReceiveLate = 0
  let toPay = 0
  let receivablesOpen = 0
  for (const d of data.debts) {
    if (calc.isPaid(d)) continue
    if (d.kind === 'payable') toPay += calc.remaining(d)
    else {
      toReceive += calc.remaining(d)
      toReceiveLate += calc.overdueAmount(d)
      receivablesOpen++
    }
  }
  const t = parseISO(today)
  const { monthIn, monthOut, net } = monthInOut(data, t.getFullYear(), t.getMonth())
  return {
    balance: totalWalletsBalance(data), walletCount: data.wallets.length,
    toReceive, toReceiveLate, toPay, monthIn, monthOut, monthNet: net, receivablesOpen,
  }
}
