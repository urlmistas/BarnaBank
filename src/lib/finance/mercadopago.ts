import type { Wallet } from '@/lib/types'

/** nome da carteira que uma versão anterior criava sozinha para o Mercado Pago (hoje o Início soma o total do painel direto) */
export const MP_WALLET = 'Mercado Pago'
export const isMpWallet = (w: Pick<Wallet, 'name'>) => w.name.trim().toLowerCase() === MP_WALLET.toLowerCase()

export interface MpPotMov {
  id: string
  at: string
  tipo: string
  valor: number
  pot: string
}

const DAY_MS = 86400000

/**
 * Quando a meta de um porquinho chega, no ritmo dos últimos 60 dias (o que foi guardado menos o que foi tirado, por mês) e com o
 * rendimento (pct% do CDI diário, 21 dias úteis por mês). null = sem meta ou sem como chegar em 50 anos.
 */
export function potForecast(
  p: { id: string; valor: number; meta: number; pct: number },
  movs: MpPotMov[],
  cdi: number,
  now = new Date(),
): { done: true } | { months: number; perMonth: number } | null {
  if (!(p.meta > 0)) return null
  if (p.valor >= p.meta) return { done: true }
  const from = now.getTime() - 60 * DAY_MS
  const mine = movs.filter((m) => m.pot === p.id && Date.parse(m.at) > from)
  let net = 0
  for (const m of mine) {
    if (m.tipo === 'guardado' || m.tipo === 'guardar') net += m.valor
    else if (m.tipo === 'resgate') net -= m.valor
  }
  const oldest = mine.length ? Math.min(...mine.map((m) => Date.parse(m.at))) : now.getTime()
  const windowDays = Math.min(60, Math.max(30, (now.getTime() - oldest) / DAY_MS))
  const perMonth = Math.round((net / windowDays) * 30 * 100) / 100
  const rate = Math.pow(1 + ((p.pct / 100) * (cdi || 0)) / 100, 21) - 1
  let v = p.valor
  for (let m = 1; m <= 600; m++) {
    v = v * (1 + rate) + Math.max(0, perMonth)
    if (v >= p.meta) return { months: m, perMonth }
  }
  return null
}

/** "menos de 1 mês", "~5 meses", "~1 ano e 3 meses" */
export function formatMonths(months: number): string {
  if (months <= 1) return 'menos de 1 mês'
  if (months < 12) return '~' + months + ' meses'
  const y = Math.floor(months / 12)
  const m = months % 12
  return '~' + y + (y === 1 ? ' ano' : ' anos') + (m ? ' e ' + m + (m === 1 ? ' mês' : ' meses') : '')
}
