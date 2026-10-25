import type { Debt, ISODate } from '@/lib/types'
import { daysBetweenISO, EPS, round2 } from './dates'
import { makeDebtCalc, paidAmount } from './debts'
import { nameKey } from './people'

// Pontualidade, nota de confiança e placar dos amigos (app.js: personReliability ~l.5445,
// trustInfo ~l.7866, boardData ~l.7451). Só dívidas a receber contam.

export interface Reliability {
  onTime: number
  late: number
  total: number
  pct: number
  avgDelay: number
  cls: 'good' | 'mid' | 'bad'
  label: string
}

export function personReliability(debts: Debt[], key: string, today: ISODate): Reliability | null {
  const calc = makeDebtCalc(today)
  let onTime = 0
  let late = 0
  const delays: number[] = []
  for (const d of debts) {
    if (nameKey(d.name) !== key || d.kind !== 'receivable') continue
    for (const it of calc.schedule(d).insts) {
      if (it.state === 'paga' && it.lastPayISO) {
        if (it.lastPayISO <= it.dueISO) onTime++
        else {
          late++
          delays.push(daysBetweenISO(it.dueISO, it.lastPayISO))
        }
      } else if (it.late) {
        late++
        delays.push(daysBetweenISO(it.dueISO, today))
      }
    }
  }
  const total = onTime + late
  if (!total) return null
  const pct = (onTime / total) * 100
  return {
    onTime, late, total, pct,
    avgDelay: delays.length ? Math.round(delays.reduce((s, x) => s + x, 0) / delays.length) : 0,
    cls: pct >= 90 ? 'good' : pct >= 60 ? 'mid' : 'bad',
    label: pct >= 90 ? 'Paga em dia' : pct >= 60 ? 'Às vezes atrasa' : 'Costuma atrasar',
  }
}

export interface Trust {
  score: number
  label: 'Excelente' | 'Boa' | 'Regular' | 'Arriscada'
  cls: 'great' | 'good' | 'mid' | 'bad'
  rel: Reliability
  maxDelay: number
  lateNow: number
  lateNowDays: number
  /** sugestão de quanto emprestar (0 = melhor não) */
  limit: number
  base: number
  hasDone: boolean
}

export function trustInfo(debts: Debt[], key: string, today: ISODate): Trust | null {
  const rel = personReliability(debts, key, today)
  if (!rel) return null
  const calc = makeDebtCalc(today)
  let maxDelay = 0
  let lateNow = 0
  let lateNowDays = 0
  let doneMax = 0
  let paidTotal = 0
  for (const d of debts) {
    if (nameKey(d.name) !== key || d.kind !== 'receivable') continue
    paidTotal += paidAmount(d)
    if (calc.isPaid(d)) doneMax = Math.max(doneMax, d.principal)
    for (const it of calc.schedule(d).insts) {
      const dl = it.state === 'paga' && it.lastPayISO ? daysBetweenISO(it.dueISO, it.lastPayISO) : it.late ? daysBetweenISO(it.dueISO, today) : 0
      if (dl > maxDelay) maxDelay = dl
      if (it.late) {
        lateNow += it.open
        lateNowDays = Math.max(lateNowDays, daysBetweenISO(it.dueISO, today))
      }
    }
  }
  // pontualidade pesa mais; atraso médio e atraso de agora tiram pontos
  let score = 100 * (0.6 * (rel.pct / 100) + 0.4 * Math.max(0, 1 - rel.avgDelay / 45))
  if (lateNow > EPS) score -= 10 + Math.min(25, lateNowDays / 3)
  if (rel.total < 3) score = Math.min(score, 80) // pouco histórico: não passa de "Boa"
  score = Math.max(0, Math.min(100, Math.round(score)))
  const lvl: [Trust['label'], Trust['cls']] =
    score >= 85 ? ['Excelente', 'great'] : score >= 70 ? ['Boa', 'good'] : score >= 50 ? ['Regular', 'mid'] : ['Arriscada', 'bad']
  const base = doneMax || paidTotal
  const factor = score >= 85 ? 1.5 : score >= 70 ? 1 : score >= 50 ? 0.5 : 0
  const limit = base > 0 && factor > 0 ? Math.max(10, Math.round((base * factor) / 10) * 10) : 0
  return { score, label: lvl[0], cls: lvl[1], rel, maxDelay, lateNow: round2(lateNow), lateNowDays, limit, base, hasDone: doneMax > 0 }
}

// ---------------------------------------------------------------- placar

export interface BoardRow {
  key: string
  name: string
  lent: number
  paid: number
  open: number
  debts: number
  done: number
  rel: Reliability | null
  medals: { icon: string; label: string }[]
  score: number
}

export function boardData(debts: Debt[], today: ISODate): BoardRow[] {
  const calc = makeDebtCalc(today)
  const by = new Map<string, BoardRow>()
  for (const d of debts) {
    if (d.kind !== 'receivable') continue
    const k = nameKey(d.name)
    const p = by.get(k) ?? { key: k, name: d.name, lent: 0, paid: 0, open: 0, debts: 0, done: 0, rel: null, medals: [], score: 0 }
    p.lent += d.principal
    p.paid += paidAmount(d)
    const paid = calc.isPaid(d)
    p.open += paid ? 0 : calc.remaining(d)
    p.debts++
    if (paid) p.done++
    by.set(k, p)
  }
  const list = [...by.values()]
  for (const p of list) p.rel = personReliability(debts, p.key, today)
  const give = (k: string, icon: string, label: string) => list.find((p) => p.key === k)?.medals.push({ icon, label })
  const withRel = list.filter((p) => p.rel && p.rel.total >= 2)
  if (withRel.length) {
    const best = withRel.slice().sort((a, b) => (b.rel as Reliability).pct - (a.rel as Reliability).pct || (a.rel as Reliability).avgDelay - (b.rel as Reliability).avgDelay)[0]
    if ((best.rel as Reliability).pct >= 60) give(best.key, '🥇', 'Mais pontual')
    const late = withRel.slice().sort((a, b) => (b.rel as Reliability).late - (a.rel as Reliability).late)[0]
    if ((late.rel as Reliability).late >= 2 && late.key !== best.key) give(late.key, '🐢', 'Rei do atraso')
  }
  const big = list.slice().sort((a, b) => b.lent - a.lent)[0]
  if (big) give(big.key, '💸', 'Quem mais pegou')
  const payer = list.slice().sort((a, b) => b.paid - a.paid)[0]
  if (payer && payer.paid > 0) give(payer.key, '💰', 'Quem mais devolveu')
  const fiel = list.slice().sort((a, b) => b.done - a.done)[0]
  if (fiel && fiel.done >= 2) give(fiel.key, '🤝', 'Mais dívidas quitadas')
  for (const p of list) p.score = (p.rel ? p.rel.pct : 50) + Math.min(30, p.done * 5) - Math.min(30, p.open / 100)
  return list.sort((a, b) => b.score - a.score)
}
