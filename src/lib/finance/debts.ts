import type { Debt, ISODate } from '@/lib/types'
import { EPS, daysBetweenISO, daysInMonth, parseISO, round2, toISO } from './dates'

// Motor de parcelas portado 1:1 do app antigo (app.js ~l.436-648).
// Diferença: `today` (asOf) é sempre passado como parâmetro em vez de `new Date()`.

export function installments(d: Debt): number {
  return d.plan ? d.plan.length : Math.max(1, d.installments || 1)
}

/** Valor total contratado (sem encargos de atraso) */
export function finalValue(d: Debt): number {
  if (d.plan) return d.plan.reduce((s, x) => s + x.v, 0)
  const n = installments(d)
  const r = (d.rate || 0) / 100
  if (d.interestType === 'simples') return d.principal * (1 + r * n)
  if (d.interestType === 'price') {
    if (r <= 0) return d.principal
    return n * ((d.principal * r) / (1 - Math.pow(1 + r, -n)))
  }
  return d.principal * Math.pow(1 + r, n)
}

export const installmentValue = (d: Debt) => finalValue(d) / installments(d)

export function paidAmount(d: Debt): number {
  return (d.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0)
}

/** idx: parcela 0-based */
export function dueDateForInstallment(d: Debt, idx: number): Date {
  const ov = d.dueOverride?.[String(idx)]
  if (ov) return parseISO(ov)
  if (d.plan && d.plan[idx]) return parseISO(d.plan[idx].due)
  if (d.firstDue) {
    const f = parseISO(d.firstDue)
    const tm = f.getMonth() + idx
    const fy = f.getFullYear() + Math.floor(tm / 12)
    const fm = tm % 12
    return new Date(fy, fm, Math.min(f.getDate(), daysInMonth(fy, fm)))
  }
  const base = parseISO(d.date)
  const totalMonths = base.getMonth() + idx + 1
  const y = base.getFullYear() + Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  const day = Math.min(d.dueDay || base.getDate(), daysInMonth(y, m))
  return new Date(y, m, day)
}

export type InstState = 'paga' | 'atrasada' | 'parcial' | 'aberta'

export interface Inst {
  i: number
  due: Date
  dueISO: ISODate
  value: number
  rem: number
  paid: number
  pen: number
  penPaid: number
  multaDone: boolean
  lastISO: ISODate | null
  touched: boolean
  lastPayISO: ISODate | null
  discounted?: number
  open: number
  late: boolean
  state: InstState
}

export interface Schedule {
  insts: Inst[]
  open: number
  credit: number
  penaltiesCharged: number
  penaltiesOpen: number
  overdue: number
  overdueCount: number
  firstOpen: Inst | null
  target: Inst | null
  pending: number
  pendingList: Inst[]
}

export function computeSchedule(d: Debt, asOf: ISODate): Schedule {
  const n = installments(d)
  const V = installmentValue(d)
  const multaPct = Math.max(0, d.lateFeePct || 0)
  const moraPct = Math.max(0, d.lateInterestPct || 0)
  const hasPenalty = multaPct > 0 || moraPct > 0
  const insts: Inst[] = []
  for (let i = 0; i < n; i++) {
    const due = dueDateForInstallment(d, i)
    const Vi = d.plan ? d.plan[i].v : V
    insts.push({
      i, due, dueISO: toISO(due), value: Vi, rem: Vi, paid: 0, pen: 0, penPaid: 0,
      multaDone: false, lastISO: null, touched: false, lastPayISO: null,
      open: 0, late: false, state: 'aberta',
    })
  }
  function accrue(inst: Inst, tISO: ISODate) {
    if (!hasPenalty || tISO <= inst.dueISO) return
    if (inst.rem > EPS) {
      if (!inst.multaDone) {
        inst.pen += (inst.rem * multaPct) / 100
        inst.multaDone = true
      }
      const from = inst.lastISO && inst.lastISO > inst.dueISO ? inst.lastISO : inst.dueISO
      const days = daysBetweenISO(from, tISO)
      if (days > 0) inst.pen += inst.rem * (moraPct / 100 / 30) * days
    }
    inst.lastISO = tISO
  }
  function payInst(inst: Inst, amount: number, tISO: ISODate) {
    if (amount <= 0) return 0
    accrue(inst, tISO)
    const a = Math.min(amount, inst.pen)
    inst.pen -= a
    inst.penPaid += a
    amount -= a
    const b = Math.min(amount, inst.rem)
    inst.rem -= b
    inst.paid += b
    amount -= b
    if (a + b > 0) {
      inst.touched = true
      inst.lastPayISO = tISO
    }
    return amount
  }
  function payRange(from: number, to: number, amount: number, tISO: ISODate) {
    for (let k = from; k < to && amount > EPS; k++) amount = payInst(insts[k], amount, tISO)
    return amount
  }
  // em qual data os encargos param de correr (dívida quitada c/ desconto)
  let endISO = asOf
  if (d.settledDate) endISO = d.settledDate < asOf ? d.settledDate : asOf
  else if ((d.discount || 0) > EPS && (d.payments || []).length) {
    endISO = (d.payments || []).reduce((mx, p) => (p.date > mx ? p.date : mx), '0000-00-00')
  }
  let credit = 0
  const ordered = (d.payments || []).map((p, idx) => ({ p, idx }))
  ordered.sort((a, b) => (a.p.date < b.p.date ? -1 : a.p.date > b.p.date ? 1 : a.idx - b.idx))
  for (const { p } of ordered) {
    const t = p.date
    let left = p.amount || 0
    if (p.mode === 'target' && typeof p.target === 'number') {
      const tgt = Math.max(0, Math.min(n - 1, p.target))
      const pend = Math.min(left, Math.max(0, p.pendingPart || 0))
      const pendLeft = payRange(0, tgt, pend, t)
      left = left - pend + pendLeft
      left = payRange(tgt, n, left, t) // parcela escolhida + adiantamento
      left = payRange(0, tgt, left, t) // sobrou depois da última? abate atrasados
    } else {
      left = payRange(0, n, left, t)
    }
    credit += left
  }
  insts.forEach((inst) => accrue(inst, endISO))
  // desconto concedido na quitação
  let disc = Math.max(0, d.discount || 0)
  insts.forEach((inst) => {
    if (disc <= EPS) return
    const a = Math.min(disc, inst.pen)
    inst.pen -= a
    disc -= a
    const b = Math.min(disc, inst.rem)
    inst.rem -= b
    disc -= b
    inst.discounted = (inst.discounted || 0) + a + b
  })
  let open = 0
  let overdue = 0
  let overdueCount = 0
  insts.forEach((inst) => {
    inst.open = inst.rem + inst.pen
    if (inst.open <= EPS) {
      inst.open = 0
      inst.rem = 0
      inst.pen = 0
    }
    inst.late = inst.open > 0 && inst.dueISO < asOf
    inst.state = inst.open === 0 ? 'paga' : inst.late ? 'atrasada' : inst.touched ? 'parcial' : 'aberta'
    open += inst.open
    if (inst.late) {
      overdue += inst.open
      overdueCount++
    }
  })
  const penaltiesCharged = insts.reduce((s, inst) => s + inst.penPaid + inst.pen, 0)
  const firstOpen = insts.find((it) => it.open > 0) ?? null
  // parcela "da vez": a primeira em aberto que não é uma parcial já vencida
  const target = insts.find((it) => it.open > 0 && !(it.touched && it.late)) ?? null
  let pending = 0
  const pendingList: Inst[] = []
  insts.forEach((it) => {
    if (it.open > 0 && (target === null || it.i < target.i)) {
      pending += it.open
      pendingList.push(it)
    }
  })
  return {
    insts, open: round2(open), credit: round2(credit), penaltiesCharged,
    penaltiesOpen: insts.reduce((s, it) => s + it.pen, 0),
    overdue, overdueCount, firstOpen, target, pending, pendingList,
  }
}

/**
 * Funções derivadas, todas com o mesmo `today`. Usa um cache por dívida (objeto) e dia,
 * como o `debtSchedule` do app antigo. Os objetos são tratados como imutáveis.
 */
export function makeDebtCalc(today: ISODate) {
  const cache = new WeakMap<Debt, Schedule>()
  const schedule = (d: Debt) => {
    let s = cache.get(d)
    if (!s) {
      s = computeSchedule(d, today)
      cache.set(d, s)
    }
    return s
  }
  const remaining = (d: Debt) => schedule(d).open
  const isPaid = (d: Debt) => remaining(d) <= EPS && (paidAmount(d) > 0 || (d.discount || 0) > 0)
  const effectiveTotal = (d: Debt) => Math.max(0, finalValue(d) + schedule(d).penaltiesCharged - (d.discount || 0))
  const overdueAmount = (d: Debt) => schedule(d).overdue
  /** atrasado (se houver) ou a próxima parcela em aberto */
  const amountDueNow = (d: Debt) => {
    const s = schedule(d)
    if (s.overdue > 0) return s.overdue
    return s.firstOpen ? s.firstOpen.open : 0
  }
  const nextDueDate = (d: Debt): Date | null => {
    if (isPaid(d)) return null
    return schedule(d).firstOpen?.due ?? null
  }
  const daysUntilDue = (d: Debt): number | null => {
    const due = nextDueDate(d)
    if (!due) return null
    return daysBetweenISO(today, toISO(due))
  }
  const statusOf = (d: Debt): DebtStatus => {
    if (isPaid(d)) return 'pago'
    const diff = daysUntilDue(d)
    if (diff === null) return 'pago'
    if (diff < 0) return 'atrasado'
    if (diff === 0) return 'hoje'
    if (diff <= 7) return 'embreve'
    return 'emdia'
  }
  /** quanto vence (em aberto) no mês y/m (0-based); no mês atual inclui o que já está atrasado */
  const openInMonth = (d: Debt, y: number, m: number) => {
    const now = parseISO(today)
    const isCurrent = now.getFullYear() === y && now.getMonth() === m
    return schedule(d).insts.reduce((sum, it) => {
      if (it.open <= 0) return sum
      const sameMonth = it.due.getFullYear() === y && it.due.getMonth() === m
      return sum + (sameMonth || (isCurrent && it.late) ? it.open : 0)
    }, 0)
  }
  /** valor do botão "Recebi/Paguei" (quickPayInfo, app.js ~l.1040) */
  const quickPayAmount = (d: Debt): number | null => {
    if (isPaid(d)) return null
    const s = schedule(d)
    if (s.overdue > EPS) return round2(s.overdue)
    if (s.firstOpen && s.firstOpen.open > EPS) return round2(s.firstOpen.open)
    return null
  }
  return {
    today, schedule, remaining, isPaid, effectiveTotal, overdueAmount, amountDueNow,
    nextDueDate, daysUntilDue, statusOf, openInMonth, quickPayAmount,
  }
}

export type DebtCalc = ReturnType<typeof makeDebtCalc>
export type DebtStatus = 'pago' | 'atrasado' | 'hoje' | 'embreve' | 'emdia'

/**
 * Dívida recorrente (assinatura) a pagar: sempre uma parcela por mês, com a próxima ainda
 * por vencer (syncRecurring, app.js ~l.421). Versão pura: devolve uma cópia ajustada.
 */
export function syncRecurringDebt(d: Debt, today: ISODate): Debt {
  if (!d.recurring || d.kind !== 'payable') return d
  let n = 1
  while (n < 600 && toISO(dueDateForInstallment(d, n - 1)) <= today) n++
  const total = round2(d.recurring.amount * n)
  if (d.installments !== n || Math.abs(d.principal - total) > EPS || d.rate !== 0 || d.interestType !== 'composto') {
    return { ...d, installments: n, days: n * 30, principal: total, rate: 0, interestType: 'composto' }
  }
  return d
}
