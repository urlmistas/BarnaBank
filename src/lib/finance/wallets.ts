import type { AppData, ISODate } from '@/lib/types'
import { parseISO } from './dates'

// Saldo das carteiras (walletEvents/walletBalance/totalWalletsBalance, app.js ~l.127-157)

export interface WalletEvent {
  date: ISODate
  amount: number
  kind: 'entrada' | 'gasto'
  label: string
  isLoan: boolean
  isTransfer: boolean
}

export function walletEvents(data: AppData, walletId: string): WalletEvent[] {
  const events: WalletEvent[] = []
  const wn = (id?: string) => data.wallets.find((x) => x.id === id)?.name ?? 'carteira excluída'
  for (const t of data.transactions) {
    if (t.type === 'transferencia') {
      if (t.walletId === walletId)
        events.push({ date: t.date, amount: t.amount, kind: 'gasto', label: 'Transferência para ' + wn(t.toWalletId), isLoan: false, isTransfer: true })
      if (t.toWalletId === walletId)
        events.push({ date: t.date, amount: t.amount, kind: 'entrada', label: 'Transferência de ' + wn(t.walletId), isLoan: false, isTransfer: true })
      continue
    }
    if (t.walletId === walletId)
      events.push({
        date: t.date, amount: t.amount, kind: t.type === 'gasto' ? 'gasto' : 'entrada',
        label: t.category || (t.type === 'gasto' ? 'Gasto' : 'Entrada'), isLoan: false, isTransfer: false,
      })
  }
  for (const d of data.debts) {
    for (const p of d.payments || []) {
      if (p.walletId === walletId)
        events.push({
          date: p.date, amount: p.amount, kind: d.kind === 'payable' ? 'gasto' : 'entrada',
          label: (d.kind === 'payable' ? 'Pagamento para ' : 'Recebido de ') + d.name, isLoan: true, isTransfer: false,
        })
    }
  }
  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function walletBalance(data: AppData, walletId: string): number {
  return walletEvents(data, walletId).reduce((sum, e) => sum + (e.kind === 'entrada' ? e.amount : -e.amount), 0)
}

export function totalWalletsBalance(data: AppData): number {
  return data.wallets.reduce((sum, w) => sum + walletBalance(data, w.id), 0)
}

/**
 * Entrou / saiu no mês (renderDashboard, app.js ~l.4021). Ignora transferências.
 * DIFERENÇA DELIBERADA: o antigo usa `new Date('YYYY-MM-DD')`, que o JS lê como UTC; no Brasil
 * (UTC-3) um lançamento do dia 1º cai no mês anterior. Aqui a data é lida em horário local.
 */
export function monthInOut(data: AppData, y: number, m: number) {
  let monthIn = 0
  let monthOut = 0
  for (const w of data.wallets) {
    for (const e of walletEvents(data, w.id)) {
      const dt = parseISO(e.date)
      if (!e.isTransfer && dt.getFullYear() === y && dt.getMonth() === m) {
        if (e.kind === 'entrada') monthIn += e.amount
        else monthOut += e.amount
      }
    }
  }
  return { monthIn, monthOut, net: monthIn - monthOut }
}

/** Saldo acumulado dia a dia (base do gráfico de evolução, renderEvoChart ~l.4040) */
export function balanceSeries(data: AppData, fromISO: ISODate, toISO_: ISODate) {
  const deltas = new Map<ISODate, number>()
  let before = 0
  for (const w of data.wallets) {
    for (const e of walletEvents(data, w.id)) {
      const v = e.kind === 'entrada' ? e.amount : -e.amount
      if (e.date < fromISO) before += v
      else if (e.date <= toISO_) deltas.set(e.date, (deltas.get(e.date) ?? 0) + v)
    }
  }
  const out: { date: ISODate; total: number }[] = []
  let cum = before
  const cur = parseISO(fromISO)
  const end = parseISO(toISO_)
  while (cur <= end) {
    const iso = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0')
    cum += deltas.get(iso) ?? 0
    out.push({ date: iso, total: Math.round(cum * 100) / 100 })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}
