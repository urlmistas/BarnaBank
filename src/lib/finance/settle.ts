import { round2 } from './dates'

// Racha de contas entre amigos (ninguém é "o centro"): cada despesa tem quem pagou e entre quem se divide; no fim sai o saldo
// de cada um e o menor número de transferências para zerar tudo. Calculadora: não grava nada.

export interface SplitExpense {
  desc: string
  amount: number
  payer: string
  /** quem divide a despesa (vazio = todos) */
  among: string[]
}

export interface Transfer {
  from: string
  to: string
  amount: number
}

export interface Settlement {
  /** quanto cada um pagou */
  paid: Record<string, number>
  /** quanto cada um deveria pagar (a parte nas despesas) */
  share: Record<string, number>
  /** pagou − parte: positivo = tem a receber; negativo = deve */
  balance: Record<string, number>
  transfers: Transfer[]
  total: number
}

/** divide em centavos sem perder nenhum: os centavos que sobram vão para os primeiros */
function splitCents(amount: number, n: number): number[] {
  const cents = Math.round(amount * 100)
  const base = Math.floor(cents / n)
  const extra = cents - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100)
}

export function settleUp(people: string[], expenses: SplitExpense[]): Settlement {
  const paid: Record<string, number> = {}
  const share: Record<string, number> = {}
  for (const p of people) {
    paid[p] = 0
    share[p] = 0
  }
  let total = 0
  for (const e of expenses) {
    if (!(e.amount > 0) || !(e.payer in paid)) continue
    const among = (e.among.length ? e.among : people).filter((p) => p in paid)
    if (!among.length) continue
    paid[e.payer] = round2(paid[e.payer] + e.amount)
    total = round2(total + e.amount)
    // a ordem fixa (a da lista de pessoas) faz os centavos sobrarem sempre para os mesmos
    const ordered = people.filter((p) => among.includes(p))
    splitCents(e.amount, ordered.length).forEach((v, i) => (share[ordered[i]] = round2(share[ordered[i]] + v)))
  }
  const balance: Record<string, number> = {}
  for (const p of people) balance[p] = round2(paid[p] - share[p])

  // guloso: o que mais deve paga ao que mais tem a receber, até zerar. Dá no máximo (pessoas − 1) transferências.
  const cred = people.filter((p) => balance[p] > 0.004).map((p) => ({ p, v: balance[p] })).sort((a, b) => b.v - a.v)
  const debt = people.filter((p) => balance[p] < -0.004).map((p) => ({ p, v: -balance[p] })).sort((a, b) => b.v - a.v)
  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debt.length && j < cred.length) {
    const v = round2(Math.min(debt[i].v, cred[j].v))
    if (v > 0) transfers.push({ from: debt[i].p, to: cred[j].p, amount: v })
    debt[i].v = round2(debt[i].v - v)
    cred[j].v = round2(cred[j].v - v)
    if (debt[i].v <= 0.004) i++
    if (cred[j].v <= 0.004) j++
  }
  return { paid, share, balance, transfers, total }
}
