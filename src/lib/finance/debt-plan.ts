import type { AppData, ISODate } from '@/lib/types'
import { EPS, round2, toISO } from './dates'
import { makeDebtCalc } from './debts'

// Plano para quitar as dívidas que EU devo (kind 'payable'): em que ordem pagar e em quanto tempo
// dá para quitar com um valor mensal. É organização, não aconselhamento financeiro.
// A simulação paga a parcela de cada dívida todo mês e manda a sobra do valor mensal para a primeira da fila.
// Limite: usa o saldo em aberto que o app já calcula e NÃO projeta juros novos de atraso nem de renegociação.

export type PlanStrategy = 'juros' | 'menor'

export interface PlanDebt {
  id: string
  name: string
  /** saldo em aberto hoje (parcelas + multa e mora já cobradas) */
  remaining: number
  /** parte já vencida */
  overdue: number
  /** valor da próxima parcela em aberto (o que sai todo mês); no máximo o saldo */
  installment: number
  /** juros por mês (%) informados na dívida; 0 se não há ou se o plano é por parcelas fixas */
  monthlyRate: number
  /** mora por mês (%) que corre sobre o atrasado */
  lateRate: number
  nextDue: ISODate | null
  /** por que está nesta posição */
  reason: 'atrasada' | 'juros' | 'menor'
  /** mês (1 = este mês) em que fica quitada com o valor mensal; null se não há valor mensal */
  paidInMonth: number | null
}

export interface DebtPlan {
  strategy: PlanStrategy
  debts: PlanDebt[]
  totalRemaining: number
  totalOverdue: number
  /** soma das parcelas: o mínimo que sai por mês */
  minMonthly: number
  /** meses para quitar tudo com o valor mensal; null sem valor mensal ou se ele não cobre as parcelas */
  months: number | null
  /** o valor mensal informado não cobre as parcelas */
  belowMin: boolean
}

/** juros mensais efetivos para ordenar: atrasada paga mora; senão vale a taxa da dívida */
const cost = (d: Pick<PlanDebt, 'overdue' | 'monthlyRate' | 'lateRate'>) => (d.overdue > EPS ? d.lateRate + d.monthlyRate : d.monthlyRate)

export function debtPlan(data: AppData, today: ISODate, strategy: PlanStrategy = 'juros', monthly = 0): DebtPlan {
  const calc = makeDebtCalc(today)
  const rows: PlanDebt[] = []
  for (const d of data.debts) {
    if (d.kind !== 'payable' || calc.isPaid(d)) continue
    const remaining = round2(calc.remaining(d))
    if (remaining <= EPS) continue
    const next = calc.nextDueDate(d)
    rows.push({
      id: d.id,
      name: d.name,
      remaining,
      overdue: round2(calc.overdueAmount(d)),
      installment: Math.min(remaining, round2(calc.schedule(d).firstOpen?.open ?? remaining)),
      // com plano de parcelas fixas a taxa não vale: os valores já vêm prontos
      monthlyRate: d.plan ? 0 : Math.max(0, d.rate || 0),
      lateRate: Math.max(0, d.lateInterestPct || 0),
      nextDue: next ? toISO(next) : null,
      reason: 'menor',
      paidInMonth: null,
    })
  }

  const byName = (a: PlanDebt, b: PlanDebt) => a.name.localeCompare(b.name, 'pt-BR')
  rows.sort((a, b) => {
    // atrasadas sempre primeiro: crescem com multa e mora
    const la = a.overdue > EPS ? 1 : 0
    const lb = b.overdue > EPS ? 1 : 0
    if (la !== lb) return lb - la
    if (strategy === 'juros') {
      const ca = cost(a)
      const cb = cost(b)
      if (Math.abs(ca - cb) > EPS) return cb - ca
    }
    return a.remaining - b.remaining || byName(a, b)
  })
  for (const r of rows) r.reason = r.overdue > EPS ? 'atrasada' : strategy === 'juros' && cost(r) > EPS ? 'juros' : 'menor'

  const minMonthly = round2(rows.reduce((t, r) => t + r.installment, 0))
  let months: number | null = null
  let belowMin = false
  if (monthly > EPS && rows.length) {
    if (monthly + EPS < minMonthly) belowMin = true
    else {
      // todo mês paga a parcela de cada dívida; o que sobra do valor mensal vai para a primeira da fila
      const rem = rows.map((r) => r.remaining)
      let m = 0
      while (rem.some((v) => v > EPS) && m < 600) {
        m++
        let extra = monthly
        rem.forEach((v, i) => {
          const pay = Math.min(v, rows[i].installment)
          rem[i] = round2(v - pay)
          extra -= pay
        })
        for (let i = 0; i < rem.length && extra > EPS; i++) {
          const pay = Math.min(rem[i], extra)
          rem[i] = round2(rem[i] - pay)
          extra -= pay
        }
        rows.forEach((r, i) => {
          if (r.paidInMonth === null && rem[i] <= EPS) r.paidInMonth = m
        })
      }
      months = m
    }
  }

  return {
    strategy,
    debts: rows,
    totalRemaining: round2(rows.reduce((s, r) => s + r.remaining, 0)),
    totalOverdue: round2(rows.reduce((s, r) => s + r.overdue, 0)),
    minMonthly,
    months,
    belowMin,
  }
}

export const REASON_TEXT: Record<PlanDebt['reason'], string> = {
  atrasada: 'atrasada, cresce com multa e mora',
  juros: 'juros mais altos',
  menor: 'menor saldo',
}
