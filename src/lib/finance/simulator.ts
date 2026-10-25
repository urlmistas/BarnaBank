import type { Debt, InterestType } from '@/lib/types'
import { finalValue } from './debts'

// Simulador de empréstimo: quanto vira a parcela e o total, e a conta por trás (formulaHtml ~1612 do antigo).

export interface LoanSim {
  total: number
  installment: number
  profit: number
  /** linhas da conta, em texto simples */
  formula: string[]
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (n: number) => String(n).split('').map((c) => SUP[+c] ?? c).join('')

const total = (principal: number, rate: number, n: number, type: InterestType) =>
  finalValue({ principal, rate, installments: n, interestType: type } as Debt)

export function simulateLoan(principal: number, rate: number, n: number, type: InterestType, money: (v: number) => string): LoanSim {
  const p = isFinite(principal) && principal > 0 ? principal : 0
  const r = isFinite(rate) && rate > 0 ? rate : 0
  const inst = Math.min(600, Math.max(1, Math.floor(n) || 1))
  const tot = total(p, r, inst, type)
  const per = tot / inst
  const rs = String(r).replace('.', ',') + '%'
  const formula: string[] = []
  if (type === 'price') {
    formula.push(`Parcela = ${money(p)} × ${rs} ÷ (1 − (1 + ${rs})${'⁻' + sup(inst)}) = ${money(per)}`)
    formula.push(`${inst} × ${money(per)} = ${money(tot)}`)
    formula.push('Juros só sobre o que ainda falta pagar (padrão de financiamentos).')
  } else {
    formula.push(
      type === 'simples' ? `${money(p)} × (1 + ${rs} × ${inst}) = ${money(tot)}` : `${money(p)} × (1 + ${rs})${sup(inst)} = ${money(tot)}`,
    )
    formula.push(`${money(tot)} ÷ ${inst} parcela${inst > 1 ? 's' : ''} = ${money(per)}/parcela`)
    if (type !== 'simples' && inst > 1 && r > 0) formula.push(`Na Tabela Price daria ${money(total(p, r, inst, 'price'))} no total.`)
  }
  return { total: tot, installment: per, profit: tot - p, formula }
}
