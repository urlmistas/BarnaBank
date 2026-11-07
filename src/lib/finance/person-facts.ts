import type { ISODate } from '@/lib/types'
import { MONTHS } from '@/lib/format'
import type { HistoryItem, PersonDetail } from './people'

// Fatos rápidos para a página da pessoa: quantas dívidas, quando vence a próxima, quando foi o último pagamento.

export interface PersonFacts {
  openCount: number
  paidCount: number
  /** próxima parcela a vencer (hoje ou depois) entre as dívidas em aberto */
  nextDue: ISODate | null
  /** data do pagamento mais recente (entrada ou saída) */
  lastPayment: ISODate | null
  paymentsCount: number
  /** vencimento da última parcela em aberto: quando a pessoa termina de pagar, se pagar em dia */
  payoffDate: ISODate | null
  /** a receber menos o que eu devo; positivo = a pessoa me deve */
  net: number
  status: 'late' | 'open' | 'settled'
}

export function personFacts(p: PersonDetail, today: ISODate): PersonFacts {
  const open = p.debts.filter((v) => !v.paid)
  const dues = open.flatMap((v) => v.insts.filter((it) => it.open > 0.005 && it.dueISO >= today).map((it) => it.dueISO)).sort()
  const lastDue = open.flatMap((v) => v.insts.filter((it) => it.open > 0.005).map((it) => it.dueISO)).sort().pop() ?? null
  const lastPayment = p.history.reduce<ISODate | null>((best, h) => (!best || h.date > best ? h.date : best), null)
  const late = p.totals.overdue > 0.005
  return {
    openCount: open.length,
    paidCount: p.debts.length - open.length,
    nextDue: dues[0] ?? null,
    lastPayment,
    payoffDate: lastDue,
    paymentsCount: p.history.length,
    net: p.totals.toReceive - p.totals.owe,
    status: late ? 'late' : open.length ? 'open' : 'settled',
  }
}

// ---- gráficos da página da pessoa

export interface MonthPoint {
  /** AAAA-MM */
  key: string
  /** "nov" */
  label: string
  /** "novembro de 2026" */
  full: string
  in: number
  out: number
}

const SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** pagamentos por mês nos últimos `months` meses (o mês de `today` é o último), com recebido (in) e pago (out) */
export function monthlyPayments(history: HistoryItem[], today: ISODate, months = 12): MonthPoint[] {
  let year = Number(today.slice(0, 4))
  let month = Number(today.slice(5, 7)) - 1
  const out: MonthPoint[] = []
  for (let i = 0; i < months; i++) {
    out.unshift({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: SHORT[month],
      full: `${MONTHS[month]} de ${year}`,
      in: 0,
      out: 0,
    })
    month -= 1
    if (month < 0) {
      month = 11
      year -= 1
    }
  }
  const by = new Map(out.map((m) => [m.key, m]))
  for (const h of history) {
    const m = by.get(h.date.slice(0, 7))
    if (!m) continue
    if (h.dir === 'in') m.in += h.amount
    else m.out += h.amount
  }
  for (const m of out) {
    m.in = Math.round(m.in * 100) / 100
    m.out = Math.round(m.out * 100) / 100
  }
  return out
}

export interface Punctuality {
  early: number
  onTime: number
  late: number
  total: number
}

/** das parcelas já pagas: quantas vieram antes, no dia (ou a 1ª) e depois do vencimento */
export function punctuality(p: PersonDetail): Punctuality {
  const r = { early: 0, onTime: 0, late: 0, total: 0 }
  for (const v of p.debts) {
    for (const it of v.insts) {
      if (it.state !== 'paga') continue
      r.total++
      if (it.timing === 'late') r.late++
      else if (it.timing === 'early') r.early++
      else r.onTime++
    }
  }
  return r
}

// ---- linha do tempo

export interface TimelineItem {
  key: string
  date: ISODate
  kind: 'debt' | 'in' | 'out' | 'late' | 'done'
  title: string
  detail?: string
  amount?: number
}

const RANK: Record<TimelineItem['kind'], number> = { done: 4, in: 3, out: 3, late: 2, debt: 1 }

/** tudo que aconteceu com a pessoa: dívida criada, pagamentos, parcelas vencidas sem pagar e dívida quitada (mais recente primeiro) */
export function personTimeline(p: PersonDetail, today: ISODate): TimelineItem[] {
  const out: TimelineItem[] = []
  for (const v of p.debts) {
    const d = v.debt
    out.push({
      key: 'debt:' + d.id,
      date: d.date,
      kind: 'debt',
      title: v.kind === 'payable' ? `Dívida criada: ${v.label}` : `Empréstimo criado: ${v.label}`,
      detail: v.n > 1 ? `${v.n} parcelas` : 'parcela única',
      amount: v.total,
    })
    for (const it of v.insts) {
      if (it.open > 0.005 && it.dueISO < today) {
        out.push({
          key: `late:${d.id}:${it.i}`,
          date: it.dueISO,
          kind: 'late',
          title: `${it.i + 1}ª parcela venceu sem pagamento`,
          detail: v.label,
          amount: it.open,
        })
      }
    }
    if (v.paid) {
      const last = p.history.filter((h) => h.debtId === d.id).reduce<ISODate | null>((b, h) => (!b || h.date > b ? h.date : b), null)
      if (last) out.push({ key: 'done:' + d.id, date: last, kind: 'done', title: `Dívida quitada: ${v.label}` })
    }
  }
  for (const h of p.history) {
    out.push({
      key: 'pay:' + h.key,
      date: h.date,
      kind: h.dir,
      title: h.dir === 'in' ? 'Pagamento recebido' : 'Pagamento feito',
      detail: [h.debtLabel, h.target ? `parcela ${h.target}` : '', h.note ?? ''].filter(Boolean).join(' · '),
      amount: h.amount,
    })
  }
  return out.sort((a, b) => (a.date === b.date ? RANK[b.kind] - RANK[a.kind] : a.date < b.date ? 1 : -1))
}

// ---- evolução do saldo

export interface BalancePoint {
  date: ISODate
  /** a receber menos o que eu devo (aproximado: conta o total da dívida, com juros previstos, desde a data dela) */
  balance: number
}

export function balanceSeries(p: PersonDetail, today: ISODate): BalancePoint[] {
  const ev: { date: ISODate; delta: number }[] = []
  for (const v of p.debts) ev.push({ date: v.debt.date, delta: (v.kind === 'receivable' ? 1 : -1) * v.total })
  // recebi (in) reduz o que me devem; paguei (out) reduz o que eu devo
  for (const h of p.history) ev.push({ date: h.date, delta: h.dir === 'in' ? -h.amount : h.amount })
  ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const pts: BalancePoint[] = []
  let acc = 0
  for (const e of ev) {
    acc += e.delta
    const bal = Math.round(acc * 100) / 100
    const last = pts[pts.length - 1]
    if (last && last.date === e.date) last.balance = bal
    else pts.push({ date: e.date, balance: bal })
  }
  const last = pts[pts.length - 1]
  if (last && last.date < today) pts.push({ date: today, balance: last.balance })
  return pts
}
