import type { AppData, Goal, GoalAdd, ISODate } from '@/lib/types'
import { daysBetweenISO, EPS, round2, ymOf } from './dates'
import { walletBalance } from './wallets'

// Metas de economia (goalSaved/goalInfo ~l.4725-4760, goalDialog ~l.4790, goalMoveDialog ~l.4836). Puro.

export const newGoalId = (prefix = 'g-') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/** quanto já foi guardado: saldo da carteira ligada, ou a soma dos aportes da meta */
export function goalSaved(data: AppData, g: Goal): number {
  if (g.walletId) {
    const w = data.wallets.find((x) => x.id === g.walletId)
    if (w) return Math.max(0, round2(walletBalance(data, w.id)))
  }
  return Math.max(0, round2((g.adds || []).reduce((s, a) => s + a.amount, 0)))
}

export interface GoalInfo {
  saved: number
  left: number
  /** 0–100 */
  pct: number
  done: boolean
  /** quanto guardar por mês para chegar no prazo */
  perMonth: number
  /** o prazo já passou e a meta não foi batida */
  late: boolean
  walletName?: string
  /** quanto está abaixo do ritmo (0 = no ritmo ou sem prazo) */
  behind: number
  /** aportes deste mês */
  monthAdds: number
}

export function goalInfo(data: AppData, g: Goal, today: ISODate): GoalInfo {
  const saved = goalSaved(data, g)
  const left = Math.max(0, round2(g.target - saved))
  const pct = g.target > 0 ? Math.min(100, (saved / g.target) * 100) : 0
  const done = left <= EPS
  let perMonth = 0
  let late = false
  if (g.deadline && !done) {
    const days = daysBetweenISO(today, g.deadline)
    if (days < 0) late = true
    else perMonth = left / Math.max(1, Math.round(days / 30.44))
  }
  // ritmo: quanto já devia ter guardado, se guardasse igual todo mês desde que criou a meta
  let behind = 0
  const ym = ymOf(today)
  const monthAdds = (g.adds || []).filter((a) => ymOf(a.date) === ym).reduce((s, a) => s + a.amount, 0)
  if (g.deadline && g.created && !done && !late && g.deadline > g.created) {
    const total = daysBetweenISO(g.created, g.deadline)
    const el = daysBetweenISO(g.created, today)
    const expected = g.target * Math.max(0, Math.min(1, el / total))
    if (saved < expected - Math.max(1, g.target * 0.05)) behind = round2(expected - saved)
  }
  const w = g.walletId ? data.wallets.find((x) => x.id === g.walletId) : undefined
  return { saved, left, pct, done, perMonth: round2(perMonth), late, walletName: w?.name, behind, monthAdds: round2(monthAdds) }
}

/** texto de apoio da meta ("até 10/12/26 · guarde R$ 200,00/mês"); `fmt` formata dinheiro e data */
export function goalSub(g: Goal, gi: GoalInfo, fmt: { money: (v: number) => string; date: (iso: ISODate) => string }): string {
  let sub = gi.done
    ? 'Meta batida!'
    : g.deadline
      ? gi.late
        ? `prazo era ${fmt.date(g.deadline)}`
        : `até ${fmt.date(g.deadline)} · guarde ${fmt.money(gi.perMonth)}/mês${gi.behind ? ` · ${fmt.money(gi.behind)} abaixo do ritmo` : ''}`
      : 'sem prazo'
  if (gi.walletName) sub += ` · saldo de ${gi.walletName}`
  return sub
}

export interface GoalInput {
  name: string
  /** NaN quando vazio */
  target: number
  deadline: ISODate | ''
  walletId: string
  /** só ao criar, sem carteira ligada */
  start: number
}

export function checkGoal(i: GoalInput): string | null {
  if (!i.name.trim()) return 'Dê um nome para a meta.'
  if (!(i.target > 0) || !isFinite(i.target)) return 'Informe quanto quer juntar.'
  if (i.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(i.deadline)) return 'Data do prazo inválida.'
  return null
}

export function createGoal(i: GoalInput, today: ISODate, id = newGoalId()): Goal {
  const g: Goal = { id, name: i.name.trim(), target: round2(i.target), deadline: i.deadline, walletId: i.walletId, adds: [], created: today }
  if (i.start > 0 && !i.walletId) g.adds.push({ id: newGoalId('ga-'), date: today, amount: round2(i.start), note: 'saldo inicial' })
  return g
}

export function updateGoal(g: Goal, i: GoalInput): Goal {
  return { ...g, name: i.name.trim(), target: round2(i.target), deadline: i.deadline, walletId: i.walletId }
}

export function goalToInput(g: Goal): GoalInput {
  return { name: g.name, target: g.target, deadline: g.deadline, walletId: g.walletId, start: 0 }
}

/** erro de um aporte (guardar/retirar), ou null */
export function checkMove(saved: number, amount: number, take: boolean): string | null {
  if (!(amount > 0)) return 'Informe o valor.'
  if (take && amount > saved + EPS) return `Só tem ${round2(saved).toFixed(2).replace('.', ',')} guardado nessa meta.`
  return null
}

export function moveGoal(g: Goal, amount: number, take: boolean, date: ISODate, id = newGoalId('ga-')): Goal {
  const add: GoalAdd = { id, date, amount: round2(take ? -amount : amount) }
  return { ...g, adds: [...(g.adds || []), add] }
}
