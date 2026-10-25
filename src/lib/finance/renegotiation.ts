import type { Debt, ISODate, PlanItem } from '@/lib/types'
import { addDaysISO, daysInMonth, EPS, parseISO, round2, toISO } from './dates'
import { makeDebtCalc } from './debts'

// Renegociar e dar mais prazo: portado do app antigo (app.js ~l.6089-6190 e openExtend ~l.6232).
// Tudo puro e sem tocar na dívida original: devolve cópias.

/** centavos em aberto que não valem uma parcela nova */
const RN_CENT = 0.05
const MAXP = 360
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export type Money = (v: number) => string

export function addMonthsISO(iso: ISODate, k: number): ISODate {
  const b = parseISO(iso)
  const tm = b.getMonth() + k
  const y = b.getFullYear() + Math.floor(tm / 12)
  const m = ((tm % 12) + 12) % 12
  return toISO(new Date(y, m, Math.min(b.getDate(), daysInMonth(y, m))))
}

export interface PlanSegment {
  n: number
  v: number
  from: ISODate
  to: ISODate
}

/** [{v, due}] → parcelas seguidas de mesmo valor juntas */
export function planSegments(list: PlanItem[]): PlanSegment[] {
  const out: PlanSegment[] = []
  for (const x of list) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.v - x.v) < 0.05) {
      last.n++
      last.to = x.due
    } else out.push({ n: 1, v: x.v, from: x.due, to: x.due })
  }
  return out
}

export const segLabel = (sg: PlanSegment, money: Money) => `${sg.n}x de ${money(sg.v)}`
export const planLabel = (d: Debt, money: Money) => (d.plan ? planSegments(d.plan).map((s) => segLabel(s, money)).join(' + ') : '')

/** "3x de R$ 100,00 + 1x de R$ 20,00" para o que ainda falta pagar */
export function remainingLabel(d: Debt, today: ISODate, money: Money): string {
  const s = makeDebtCalc(today).schedule(d)
  const open = s.insts.filter((it) => it.open > RN_CENT).map((it) => ({ v: round2(it.open), due: it.dueISO }))
  return planSegments(open).map((sg) => segLabel(sg, money)).join(' + ')
}

export interface RenegDefaults {
  open: number
  count: number
  curV: number
  start: ISODate
}

export function renegDefaults(d: Debt, today: ISODate): RenegDefaults {
  const s = makeDebtCalc(today).schedule(d)
  const open = s.insts.filter((it) => it.open > RN_CENT)
  const first = open[0]
  let start = first ? first.dueISO : today
  if (first && start < today) {
    // atrasada: a próxima data no mesmo dia do mês, a partir de hoje
    const t = parseISO(today)
    const day = first.due.getDate()
    let c = new Date(t.getFullYear(), t.getMonth(), Math.min(day, daysInMonth(t.getFullYear(), t.getMonth())))
    if (toISO(c) < today) c = new Date(t.getFullYear(), t.getMonth() + 1, Math.min(day, daysInMonth(t.getFullYear(), t.getMonth() + 1)))
    start = toISO(c)
  }
  return { open: round2(s.open), count: open.length, curV: first ? round2(first.value) : 0, start }
}

export type RenegMode = 'depois' | 'fim' | 'estender'

export interface RenegInput {
  value: number
  start: ISODate
  mode: RenegMode
  /** só no modo 'depois': valor das parcelas da diferença (vazio/0 = automático) */
  diffValue?: number
}

export interface RenegPlan {
  plan: PlanItem[]
  /** quantas parcelas do começo do plano ficam como estão (já pagas) */
  keep: number
  /** quanto falta pagar hoje */
  open: number
}

/**
 * Monta o plano novo sem mexer na dívida. 'depois': a diferença vem depois, em parcelas;
 * 'fim': a diferença numa parcela só no fim; 'estender': mais parcelas do valor novo, até acabar.
 */
export function buildReneg(d: Debt, today: ISODate, o: RenegInput): RenegPlan | null {
  const s = makeDebtCalc(today).schedule(d)
  const keep: PlanItem[] = []
  const R = round2(s.open)
  const newV = round2(o.value || 0)
  if (!(newV > 0) || !(R > EPS) || !ISO_RE.test(o.start || '')) return null
  for (const it of s.insts) {
    if (it.open <= EPS) keep.push({ v: round2(it.value), due: it.dueISO })
    else if (it.open <= RN_CENT) keep.push({ v: round2(it.paid), due: it.dueISO }) // só centavos em aberto: vão pras parcelas novas
    else if (it.paid > EPS) keep.push({ v: round2(it.paid), due: it.dueISO }) // o que já foi pago de uma parcela fica como está
  }
  let m = s.insts.filter((it) => it.open > RN_CENT).length
  if (!m) m = 1
  let tail: number[] = []
  const D = round2(R - newV * m)
  if (o.mode !== 'estender' && D > EPS && D < 1) {
    // sobra só de centavos (arredondamento): vai na última parcela, sem parcela nova
    for (let z = 0; z < m; z++) tail.push(newV)
    tail[m - 1] = round2(newV + D)
  } else if (o.mode === 'estender' || D <= EPS) {
    const k = Math.max(1, Math.ceil(R / newV - 1e-9))
    if (k > MAXP) return null
    for (let i = 0; i < k; i++) tail.push(i < k - 1 ? newV : round2(R - newV * (k - 1)))
  } else {
    for (let j = 0; j < m; j++) tail.push(newV)
    if (o.mode === 'fim') tail.push(D)
    else {
      let dv = round2((o.diffValue ?? 0) > 0 ? (o.diffValue as number) : D / m)
      if (!(dv >= 0.01) || dv > D) dv = D
      const k2 = Math.max(1, Math.ceil(D / dv - 1e-9))
      if (k2 > MAXP) return null
      for (let q = 0; q < k2; q++) tail.push(q < k2 - 1 ? dv : round2(D - dv * (k2 - 1)))
    }
  }
  tail = tail.filter((v) => v > EPS)
  // resto de centavos no fim vira parte da parcela anterior
  if (tail.length > 1 && tail[tail.length - 1] < 1) {
    const cents = tail.pop() as number
    tail[tail.length - 1] = round2(tail[tail.length - 1] + cents)
  }
  const plan = keep.concat(tail.map((v, idx) => ({ v, due: addMonthsISO(o.start, idx) })))
  return { plan, keep: keep.length, open: R }
}

/** aplica o plano na dívida (applyReneg ~l.6177); devolve a dívida nova */
export function applyReneg(d: Debt, r: RenegPlan, today: ISODate, money: Money, note = ''): Debt {
  const fromLbl = remainingLabel(d, today, money)
  const plan = r.plan.map((x) => ({ ...x }))
  const next: Debt = { ...d, plan, installments: plan.length, days: plan.length * 30 }
  if (d.dueOverride) {
    const ov: Record<string, ISODate> = {}
    for (const [k, v] of Object.entries(d.dueOverride)) if (+k < r.keep) ov[k] = v
    if (Object.keys(ov).length) next.dueOverride = ov
    else delete next.dueOverride
  }
  // centavos de arredondamento (ou encargos que ficaram pra trás) entram na última parcela
  const diff = round2(r.open - makeDebtCalc(today).remaining(next))
  if (Math.abs(diff) > EPS) {
    const last = plan[plan.length - 1]
    last.v = round2(last.v + diff)
  }
  const to = planSegments(plan.slice(r.keep)).map((sg) => segLabel(sg, money)).join(' + ')
  const prev = Array.isArray(d.reneg) ? (d.reneg as unknown[]) : []
  next.reneg = prev.concat([{ at: today, from: fromLbl, to, note: note.trim() }])
  return next
}

// ---------------------------------------------------------------- mais prazo

/** parcelas que o "Dar mais prazo" mexe: as atrasadas ou, se nada atrasou, a próxima em aberto */
export function extendTargets(d: Debt, today: ISODate): { idx: number; dueISO: ISODate }[] {
  const s = makeDebtCalc(today).schedule(d)
  let targets = s.insts.filter((it) => it.open > 0 && it.dueISO < today)
  if (!targets.length && s.firstOpen) targets = [s.firstOpen]
  return targets.map((it) => ({ idx: it.i, dueISO: it.dueISO }))
}

/** data sugerida: 7 dias depois do maior vencimento (ou de hoje, se já passou) */
export function extendDefault(d: Debt, today: ISODate): ISODate {
  const t = extendTargets(d, today)
  if (!t.length) return addDaysISO(today, 7)
  const cur = t[t.length - 1].dueISO
  return addDaysISO(cur > today ? cur : today, 7)
}

/** remarca as parcelas alvo para `newDate` (reschedule ~l.6089). Nada muda se a data não for depois do vencimento atual. */
export function rescheduleDebt(d: Debt, today: ISODate, newDate: ISODate): { debt: Debt; moved: number } {
  const targets = extendTargets(d, today).filter((t) => newDate > t.dueISO)
  if (!targets.length) return { debt: d, moved: 0 }
  const ov: Record<string, ISODate> = { ...(d.dueOverride ?? {}) }
  for (const t of targets) ov[String(t.idx)] = newDate
  return { debt: { ...d, dueOverride: ov }, moved: targets.length }
}
