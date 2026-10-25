import type { Goal, Recurring } from '@/lib/types'
import type { StoreApi } from '@/lib/store'
import { normalizeBudgets, normalizeRecurring } from './plan-normalize'
import { runRecurring } from './recurring'

// Gravação de orçamento, metas e recorrentes: mexe só nessas chaves do JSON (via `api.raw`), o resto fica intacto.
// As listas voltam como estão no armazenamento (itens que o app não entende não são apagados); só os itens
// que a operação toca (por id) mudam.

const rawList = <T extends { id: string }>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [])

export const getGoals = (api: StoreApi): Goal[] => rawList<Goal>(api.raw.goals)
export const setGoals = (api: StoreApi, list: Goal[]) => {
  api.raw.goals = list
}
export const getRecurring = (api: StoreApi): Recurring[] => rawList<Recurring>(api.raw.recurring)
export const setRecurring = (api: StoreApi, list: Recurring[]) => {
  api.raw.recurring = list
}
export const getBudgets = (api: StoreApi) => normalizeBudgets(api.raw.budgets)
export const setBudgets = (api: StoreApi, b: Record<string, number>) => {
  api.raw.budgets = b
}

export function replaceGoal(api: StoreApi, id: string, fn: (g: Goal) => Goal) {
  setGoals(api, getGoals(api).map((g) => (g.id === id ? fn(g) : g)))
}

export function replaceRecurring(api: StoreApi, id: string, fn: (r: Recurring) => Recurring) {
  setRecurring(api, getRecurring(api).map((r) => (r.id === id ? fn(r) : r)))
}

/** lança os recorrentes que venceram e ainda não entraram; devolve quantos nasceram */
export function postRecurring(api: StoreApi, today: string): number {
  const raw = getRecurring(api)
  const out = runRecurring(normalizeRecurring(raw), api.transactions, api.wallets, today)
  if (out.made > 0) {
    const byId = new Map(out.recurring.map((r) => [r.id, r]))
    setRecurring(api, raw.map((r) => byId.get(r.id) ?? r))
    api.transactions = out.transactions
  }
  return out.made
}
