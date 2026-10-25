import type { AppData, Goal, Recurring } from '@/lib/types'

// Leitura de orçamento, metas e recorrentes (migrateFinance ~l.268-295). Só na memória, sobre uma cópia.

type Raw = Record<string, unknown>
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const YM_RE = /^\d{4}-\d{2}$/
const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v)
const asArr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])
const dayOf = (v: unknown) => {
  const n = parseInt(String(v), 10)
  return n >= 1 && n <= 31 ? n : 1
}

export function normalizeBudgets(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Raw)) if (isNum(val) && val > 0 && k.trim()) out[k.trim()] = Math.round(val * 100) / 100
  }
  return out
}

export function normalizeGoals(v: unknown): Goal[] {
  return asArr(v)
    .filter((g) => g && g.id && typeof g.name === 'string' && isNum(g.target) && g.target > 0)
    .map((g) => ({
      ...g,
      adds: asArr(g.adds).filter((a) => a && isNum(a.amount)),
      walletId: typeof g.walletId === 'string' ? g.walletId : '',
      deadline: typeof g.deadline === 'string' && ISO_RE.test(g.deadline) ? g.deadline : '',
    })) as unknown as Goal[]
}

export function normalizeRecurring(v: unknown): Recurring[] {
  return asArr(v)
    .filter((r) => r && r.id && isNum(r.amount) && r.amount > 0 && typeof r.walletId === 'string' && YM_RE.test(String(r.start || '')))
    .map((r) => ({
      ...r,
      type: r.type === 'entrada' ? 'entrada' : 'gasto',
      day: dayOf(r.day),
      posted: r.posted && typeof r.posted === 'object' ? { ...(r.posted as Record<string, string>) } : {},
      category: typeof r.category === 'string' ? r.category : '',
    })) as unknown as Recurring[]
}

/** campos de planejamento de um JSON cru, para somar ao AppData */
export function normalizePlan(p: Raw): Pick<AppData, 'budgets' | 'goals' | 'recurring'> {
  return { budgets: normalizeBudgets(p.budgets), goals: normalizeGoals(p.goals), recurring: normalizeRecurring(p.recurring) }
}
