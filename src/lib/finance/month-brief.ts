import type { AppData, ISODate } from '@/lib/types'
import { EPS, daysBetweenISO, daysInMonth, parseISO, round2, toISO } from './dates'
import { upcomingItems } from './dashboard'
import { totalWalletsBalance } from './wallets'

// Resumo do mês no Início: o que ainda vence até o fim do mês, quanto sobra e onde o saldo aperta.
// Só usa dados que o app já tem (nada sai do navegador). Não estima gastos do dia a dia.

export type BriefVerdict = 'empty' | 'ok' | 'tight' | 'no'

export interface BriefShortfall {
  date: ISODate
  title: string
  /** quanto falta no saldo depois deste vencimento */
  missing: number
}

export interface MonthBrief {
  verdict: BriefVerdict
  balance: number
  /** dias até o último dia do mês (0 = hoje é o último) */
  daysLeft: number
  /** último dia do mês */
  endDate: ISODate
  /** soma do que ainda sai (inclui atrasados) */
  outTotal: number
  /** parte de outTotal que já venceu */
  lateOut: number
  /** soma do que ainda entra (sem os recebimentos atrasados, que não são certos) */
  inTotal: number
  /** recebimentos atrasados deixados de fora da conta */
  lateInCount: number
  /** saldo previsto no fim do mês: saldo + entradas - saídas */
  endBalance: number
  /** quanto sobra por dia, contando hoje, até o fim do mês (0 se não sobra) */
  perDay: number
  /** primeiro vencimento que deixa o saldo negativo */
  shortfall: BriefShortfall | null
  /** quantidade de vencimentos que entram na conta */
  count: number
}

export function monthBrief(data: AppData, today: ISODate): MonthBrief {
  const t = parseISO(today)
  const endDate = toISO(new Date(t.getFullYear(), t.getMonth(), daysInMonth(t.getFullYear(), t.getMonth())))
  const daysLeft = Math.max(0, daysBetweenISO(today, endDate))
  const balance = round2(totalWalletsBalance(data))

  const all = upcomingItems(data, today, daysLeft)
  const lateIn = all.filter((i) => i.late && i.dir === 'in')
  // recebimento atrasado não é dinheiro certo: não entra na conta
  const items = all
    .filter((i) => !(i.late && i.dir === 'in'))
    // na mesma data, saídas antes das entradas (visão cautelosa)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.dir === b.dir ? 0 : a.dir === 'out' ? -1 : 1))

  let run = balance
  let outTotal = 0
  let inTotal = 0
  let lateOut = 0
  let shortfall: BriefShortfall | null = null
  for (const i of items) {
    if (i.dir === 'out') {
      outTotal += i.amount
      if (i.late) lateOut += i.amount
      run -= i.amount
      if (!shortfall && run < -EPS) shortfall = { date: i.date, title: i.title, missing: round2(-run) }
    } else {
      inTotal += i.amount
      run += i.amount
    }
  }
  outTotal = round2(outTotal)
  inTotal = round2(inTotal)
  lateOut = round2(lateOut)
  const endBalance = round2(balance + inTotal - outTotal)

  let verdict: BriefVerdict
  if (!data.wallets.length) verdict = 'empty'
  else if (endBalance < -EPS || shortfall) verdict = 'no'
  else if (outTotal > EPS && endBalance < outTotal * 0.1) verdict = 'tight'
  else verdict = 'ok'

  return {
    verdict, balance, daysLeft, endDate, outTotal, lateOut, inTotal, lateInCount: lateIn.length,
    endBalance, perDay: endBalance > EPS ? round2(endBalance / (daysLeft + 1)) : 0, shortfall, count: items.length,
  }
}

/** frase principal do resumo */
export function briefHeadline(b: MonthBrief, money: (v: number) => string): string {
  if (b.verdict === 'empty') return 'Cadastre uma carteira para ver a previsão do mês.'
  if (b.count === 0) return 'Nada mais vence neste mês.'
  if (b.verdict === 'no') {
    return b.shortfall
      ? `O saldo não cobre tudo: faltam ${money(b.shortfall.missing)} depois de "${b.shortfall.title}".`
      : `O saldo não cobre tudo: faltam ${money(-b.endBalance)} até o fim do mês.`
  }
  if (b.verdict === 'tight') return `Cabe, mas apertado: sobram só ${money(b.endBalance)} no fim do mês.`
  return `Cabe com folga: sobram ${money(b.endBalance)} no fim do mês.`
}
