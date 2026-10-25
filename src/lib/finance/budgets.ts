import type { AppData, ISODate, YearMonth } from '@/lib/types'
import { daysInMonth, round2, ymOf } from './dates'
import { normTxt } from './people'
import { monthSpending } from './reports'

// Orçamento por categoria (budgetStatus ~l.4590, budgetDialog ~l.4630, knownExpenseCats ~l.4617).
// Puro: `today` sempre como parâmetro.

export type BudgetClass = 'ok' | 'warn' | 'over'

export interface BudgetRow {
  name: string
  limit: number
  spent: number
  /** gasto / limite, em % (pode passar de 100) */
  pct: number
  left: number
  cls: BudgetClass
  /** quanto ainda dá para gastar por dia até o fim do mês (só no mês atual) */
  perDay: number
}

/** situação de cada categoria com limite, do mês `key`; a mais perto de estourar vem primeiro */
export function budgetStatus(data: AppData, key: YearMonth, today: ISODate): BudgetRow[] {
  const budgets = data.budgets ?? {}
  const sp = monthSpending(data, key)
  const isNow = key === ymOf(today)
  const daysLeft = isNow ? daysInMonth(+key.slice(0, 4), +key.slice(5, 7) - 1) - Number(today.slice(8, 10)) + 1 : 0
  return Object.keys(budgets)
    .map((name) => {
      const limit = budgets[name]
      const c = sp.byCat[normTxt(name)]
      const spent = c ? c.amount : 0
      const pct = limit > 0 ? (spent / limit) * 100 : 0
      const left = round2(limit - spent)
      const cls: BudgetClass = pct > 100 + 1e-9 ? 'over' : pct >= 80 ? 'warn' : 'ok'
      return { name, limit, spent, pct, left, cls, perDay: isNow && daysLeft > 0 && left > 0.005 ? left / daysLeft : 0 }
    })
    .sort((a, b) => b.pct - a.pct)
}

/** categorias de gasto que já apareceram nos dados (sem repetir por acento ou maiúscula) */
export function knownExpenseCats(data: AppData): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string | undefined) => {
    const c = (raw || '').trim()
    const k = normTxt(c)
    if (!c || seen.has(k)) return
    seen.add(k)
    out.push(c)
  }
  Object.keys(data.budgets ?? {}).forEach(push)
  for (const t of data.transactions) if (t.type === 'gasto' && !(t.auto && /^card:/.test(t.auto))) push(t.category)
  for (const p of data.cardPurchases) push(p.category)
  for (const b of data.bills) if (b.kind !== 'entrada') push(b.category || b.name)
  return out
}

export interface BudgetFormInput {
  /** limite de cada categoria conhecida (0 ou NaN = sem limite) */
  limits: { name: string; limit: number }[]
  newName: string
  /** NaN quando vazio */
  newLimit: number
}

/** monta o novo orçamento a partir do formulário (onOk do budgetDialog) */
export function buildBudgets(input: BudgetFormInput): { budgets: Record<string, number> } | { error: string } {
  const next: Record<string, number> = {}
  for (const { name, limit } of input.limits) if (limit > 0) next[name] = round2(limit)
  const nc = input.newName.trim()
  if (nc) {
    if (!(input.newLimit > 0)) return { error: `Informe o limite para "${nc}".` }
    // categoria que já existe (sem acento ou maiúscula) reaproveita o nome
    const exist = [...Object.keys(next), ...input.limits.map((l) => l.name)].find((k) => normTxt(k) === normTxt(nc))
    next[exist || nc] = round2(input.newLimit)
  }
  return { budgets: next }
}

/** quantas categorias estouraram o limite */
export const overCount = (rows: BudgetRow[]) => rows.filter((r) => r.cls === 'over').length
