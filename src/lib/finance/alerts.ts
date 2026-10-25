import type { AppData, ISODate } from '@/lib/types'
import { EPS, round2, ymAdd, ymOf } from './dates'
import { monthSpending } from './reports'

// Gastos fora do padrão (spendingAlerts ~l.7404 do app antigo): categoria do mês que passou muito da média dos 3 meses anteriores.

export interface SpendingAlert {
  /** chave da categoria (a mesma de monthSpending) */
  key: string
  name: string
  cur: number
  /** média dos meses anteriores com gasto (0 = categoria nova) */
  avg: number
  /** cur / avg (0 quando não há média) */
  ratio: number
}

/** pelo menos 50% acima da média e R$ 50 a mais; sem histórico da categoria, só a partir de R$ 300 e com 2 meses de histórico */
export function spendingAlerts(data: AppData, today: ISODate): SpendingAlert[] {
  const key = ymOf(today)
  const sp = monthSpending(data, key)
  const hist = [1, 2, 3].map((i) => monthSpending(data, ymAdd(key, -i)))
  const have = hist.filter((h) => h.total > 0).length
  if (!have) return []
  const out: SpendingAlert[] = []
  for (const [k, c] of Object.entries(sp.byCat)) {
    const avg = hist.reduce((s, h) => s + (h.byCat[k]?.amount ?? 0), 0) / have
    if (avg > EPS && c.amount >= avg * 1.5 && c.amount - avg >= 50) out.push({ key: k, name: c.name, cur: round2(c.amount), avg: round2(avg), ratio: c.amount / avg })
    else if (avg <= EPS && c.amount >= 300 && have >= 2) out.push({ key: k, name: c.name, cur: round2(c.amount), avg: 0, ratio: 0 })
  }
  return out.sort((a, b) => b.cur - b.avg - (a.cur - a.avg))
}

/** "+60% da sua média (R$ 100,00)", "2,5x da sua média…" ou "gasto novo, sem histórico" */
export function alertText(a: SpendingAlert, money: (v: number) => string): string {
  if (a.avg <= 0) return 'gasto novo, sem histórico'
  const how = a.ratio >= 1.95 ? String(Math.round(a.ratio * 10) / 10).replace('.', ',') + 'x' : '+' + Math.round((a.ratio - 1) * 100) + '%'
  return `${how} da sua média (${money(a.avg)})`
}

// alertas que a pessoa já viu e escondeu: { "2026-10:<categoria>": 1 } na mesma chave do app antigo
export const ALERTS_HIDE_KEY = 'barnabank_alerts_hide'

export function readHiddenAlerts(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Record<string, 1> {
  try {
    const v: unknown = JSON.parse(storage?.getItem(ALERTS_HIDE_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, 1>) : {}
  } catch {
    return {}
  }
}

export function hideAlert(month: string, key: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(ALERTS_HIDE_KEY, JSON.stringify({ ...readHiddenAlerts(storage), [month + ':' + key]: 1 }))
  } catch {
    /* sem armazenamento: some só até recarregar */
  }
}
