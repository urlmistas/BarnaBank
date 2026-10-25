import type { AppData, ISODate, YearMonth } from '@/lib/types'
import { EPS, dayIn, ymAdd, ymOf } from './dates'
import { billApplies, billStatus, cardInvoices } from './bills-cards'
import { billRouteId, billTx, cardRouteId } from './contas'
import { installments, makeDebtCalc } from './debts'
import { nameKey } from './people'

// Calendário do mês (Contas): parcelas de dívidas, contas fixas, faturas e recorrentes num lugar só.
// Portado de monthEvents (app.js ~5620).

export type EventKind = 'debt' | 'bill' | 'card' | 'rec'

export interface MonthEvent {
  key: string
  date: ISODate
  kind: EventKind
  title: string
  sub: string
  amount: number
  dir: 'in' | 'out'
  done: boolean
  late: boolean
  /** rota para abrir o item */
  to: string
  /** dívida: id e se é a próxima parcela em aberto (candidata ao "Recebi/Paguei") */
  debtId?: string
  nextOpen?: boolean
  billId?: string
  cardId?: string
  invoiceKey?: YearMonth
  balance?: number
  due?: ISODate
}

const INV_LABEL: Record<string, string> = { vazia: '', paga: 'paga', atrasada: 'atrasada', fechada: 'fechada', aberta: 'aberta' }

export function monthEvents(data: AppData, key: YearMonth, today: ISODate): MonthEvent[] {
  const ev: MonthEvent[] = []
  const calc = makeDebtCalc(today)
  const groupTitle = (id?: string) => (id ? data.groups.find((g) => g.id === id)?.title : undefined)

  for (const d of data.debts) {
    const pay = d.kind === 'payable'
    const n = installments(d)
    const s = calc.schedule(d)
    for (const it of s.insts) {
      if (ymOf(it.dueISO) !== key) continue
      const done = it.state === 'paga'
      const g = groupTitle(d.groupId)
      ev.push({
        key: `d:${d.id}:${it.i}`, date: it.dueISO, kind: 'debt', title: d.name,
        sub:
          (g ?? (n > 1 ? `parcela ${it.i + 1}/${n}` : pay ? 'eu devo' : 'empréstimo')) +
          (done ? ` · ${pay ? 'paga' : 'recebida'}` : it.late ? ' · atrasada' : ''),
        amount: done ? it.value : it.open, dir: pay ? 'out' : 'in', done, late: it.late,
        to: '/pessoas/' + encodeURIComponent(nameKey(d.name)), debtId: d.id, nextOpen: !done && s.firstOpen === it,
      })
    }
  }

  for (const b of data.bills) {
    if (!billApplies(b, key)) continue
    const st = billStatus(b, key, today)
    const inc = b.kind === 'entrada'
    const done = st.st === 'paga'
    const tx = billTx(b, key, data.transactions)
    ev.push({
      key: `b:${b.id}`, date: st.due, kind: 'bill', title: b.name,
      sub: 'conta fixa' + (done ? (inc ? ' · recebida' : ' · paga') : st.due < today ? ' · atrasada' : ''),
      amount: tx ? tx.amount : b.amount, dir: inc ? 'in' : 'out', done, late: !done && st.due < today,
      to: `/contas/${billRouteId(b.id)}?m=${key}`, billId: b.id,
    })
  }

  for (const card of data.cards) {
    const all = cardInvoices(data, card, today)
    for (const k of [ymAdd(key, -1), key]) {
      const it = all.get(k)
      if (!it.due || ymOf(it.due) !== key || !((it.total ?? 0) > EPS)) continue
      const done = (it.balance ?? 0) <= EPS
      ev.push({
        key: `c:${card.id}:${k}`, date: it.due, kind: 'card', title: 'Fatura ' + card.name,
        sub: 'cartão' + (INV_LABEL[it.status ?? ''] ? ' · ' + INV_LABEL[it.status ?? ''] : ''),
        amount: done ? it.total! : it.balance!, dir: 'out', done, late: it.status === 'atrasada',
        to: `/contas/${cardRouteId(card.id)}?m=${k}`, cardId: card.id, invoiceKey: k, balance: it.balance, due: it.due,
      })
    }
  }

  for (const r of data.recurring ?? []) {
    if (r.active === false || !r.start || r.start > key || (r.end && r.end < key)) continue
    const done = !!(r.posted && r.posted[key])
    ev.push({
      key: `r:${r.id}`, date: dayIn(key, r.day), kind: 'rec', title: r.note || r.category,
      sub: 'recorrente' + (done ? ' · lançado' : ' · automático'), amount: r.amount, dir: r.type === 'entrada' ? 'in' : 'out',
      done, late: false, to: '/carteiras',
    })
  }

  return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export interface CalendarDay {
  /** 1..31, ou 0 para os espaços antes do dia 1 */
  day: number
  iso: ISODate
  events: MonthEvent[]
  hasIn: boolean
  hasOut: boolean
  hasLate: boolean
  allDone: boolean
}

/** a grade do mês: espaços iniciais (dia 0) + um item por dia, com o que acontece nele */
export function calendarGrid(key: YearMonth, events: MonthEvent[]): CalendarDay[] {
  const y = +key.slice(0, 4)
  const m = +key.slice(5, 7) - 1
  const dim = new Date(y, m + 1, 0).getDate()
  const first = new Date(y, m, 1).getDay()
  const byDay = new Map<ISODate, MonthEvent[]>()
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const out: CalendarDay[] = []
  for (let i = 0; i < first; i++) out.push({ day: 0, iso: '', events: [], hasIn: false, hasOut: false, hasLate: false, allDone: false })
  for (let d = 1; d <= dim; d++) {
    const iso = dayIn(key, d)
    const list = byDay.get(iso) ?? []
    out.push({
      day: d, iso, events: list,
      hasIn: list.some((e) => e.dir === 'in' && !e.done),
      hasOut: list.some((e) => e.dir === 'out' && !e.done),
      hasLate: list.some((e) => e.late),
      allDone: list.length > 0 && list.every((e) => e.done),
    })
  }
  return out
}

/** dia inicial selecionado: hoje (se for o mês), o primeiro item em aberto, ou o dia 1 */
export function defaultDay(key: YearMonth, events: MonthEvent[], today: ISODate): ISODate {
  if (ymOf(today) === key) return today
  return (events.find((e) => !e.done) ?? events[0])?.date ?? key + '-01'
}

export function calendarTotals(events: MonthEvent[]): { in: number; out: number } {
  let inn = 0
  let out = 0
  for (const e of events) {
    if (e.done) continue
    if (e.dir === 'in') inn += e.amount
    else out += e.amount
  }
  return { in: inn, out }
}
