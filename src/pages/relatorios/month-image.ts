import type { AppData, ISODate, YearMonth } from '@/lib/types'
import { budgetStatus, type BudgetRow } from '@/lib/finance/budgets'
import { EPS, ymOf } from '@/lib/finance/dates'
import { goalInfo } from '@/lib/finance/goals'
import { monthSpending } from '@/lib/finance/reports'
import { MONTHS } from '@/lib/format'

// Resumo do mês em imagem (drawMonthImage ~l.5760): entradas, gastos, saldo, para onde foi o dinheiro, orçamento e metas.
// `monthSummary` é puro (testável); `drawMonthImage` só desenha num canvas.

export interface MonthSummary {
  key: YearMonth
  title: string
  income: number
  spending: number
  balance: number
  bills: number
  card: number
  other: number
  loanIn: number
  loanOut: number
  cats: { name: string; amount: number; card: number }[]
  budgets: BudgetRow[]
  goals: { name: string; saved: number; target: number; pct: number }[]
}

export function monthSummary(data: AppData, key: YearMonth, today: ISODate): MonthSummary {
  const sp = monthSpending(data, key)
  const income = data.transactions.filter((t) => t.type === 'entrada' && ymOf(t.date) === key).reduce((s, t) => s + t.amount, 0)
  let loanIn = 0
  let loanOut = 0
  for (const d of data.debts) {
    for (const p of d.payments || []) {
      if (ymOf(p.date) !== key) continue
      if (d.kind === 'payable') loanOut += p.amount
      else loanIn += p.amount
    }
  }
  const cats = Object.values(sp.byCat)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((c) => ({ name: c.name, amount: c.amount, card: c.card }))
  const goals = (data.goals ?? []).slice(0, 3).map((g) => {
    const gi = goalInfo(data, g, today)
    return { name: g.name, saved: gi.saved, target: g.target, pct: gi.pct }
  })
  return {
    key,
    title: `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`,
    income,
    spending: sp.total,
    balance: income - sp.total,
    bills: sp.bills,
    card: sp.card,
    other: sp.other,
    loanIn,
    loanOut,
    cats,
    budgets: budgetStatus(data, key, today).slice(0, 4),
    goals,
  }
}

const COLOR = { bg0: '#14171f', bg1: '#0a0c11', fg: '#eee9da', muted: '#8c92a3', pos: '#57b98a', neg: '#e2665c', warn: '#c9a24a', track: '#101319' }

function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function fit(c: CanvasRenderingContext2D, text: string, max: number) {
  if (c.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && c.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

/** desenha o resumo (1080 de largura, altura conforme o conteúdo) e devolve o canvas */
export function drawMonthImage(s: MonthSummary, money: (v: number) => string, dateText: string): HTMLCanvasElement {
  const W = 1080
  const P = 72
  const rows = (n: number) => (n ? 120 + n * 74 : 0)
  const H = 470 + 120 + rows(s.cats.length) + 260 + rows(s.budgets.length) + rows(s.goals.length) + 200
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  const bg = c.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, COLOR.bg0)
  bg.addColorStop(1, COLOR.bg1)
  c.fillStyle = bg
  c.fillRect(0, 0, W, H)
  c.textBaseline = 'alphabetic'
  c.fillStyle = COLOR.muted
  c.font = '600 28px Inter, sans-serif'
  c.fillText('BarnaBank', P, 94)
  c.font = '600 30px Inter, sans-serif'
  c.fillText('Resumo de', P, 214)
  c.fillStyle = COLOR.fg
  c.font = '700 70px Inter, sans-serif'
  c.fillText(s.title, P, 290)

  let y = 340
  const bw = (W - 2 * P - 40) / 3
  const figures: [string, number, string][] = [
    ['Entradas', s.income, COLOR.pos],
    ['Gastos', s.spending, COLOR.neg],
    ['Saldo', s.balance, s.balance >= 0 ? COLOR.pos : COLOR.neg],
  ]
  figures.forEach(([label, v, col], i) => {
    const x = P + i * (bw + 20)
    c.fillStyle = 'rgba(255,255,255,0.04)'
    round(c, x, y, bw, 130, 22)
    c.fill()
    c.fillStyle = COLOR.muted
    c.font = '600 24px Inter, sans-serif'
    c.fillText(label, x + 24, y + 46)
    c.fillStyle = col
    c.font = '700 38px Inter, sans-serif'
    c.fillText(fit(c, money(v), bw - 40), x + 24, y + 102)
  })
  y += 190

  const title = (t: string) => {
    c.fillStyle = COLOR.fg
    c.font = '700 34px Inter, sans-serif'
    c.fillText(t, P, y)
    y += 34
  }
  const bar = (label: string, valText: string, frac: number, col: string) => {
    c.fillStyle = COLOR.fg
    c.font = '600 27px Inter, sans-serif'
    c.fillText(fit(c, label, 560), P, y + 26)
    c.textAlign = 'right'
    c.fillStyle = COLOR.muted
    c.font = '600 26px Inter, sans-serif'
    c.fillText(valText, W - P, y + 26)
    c.textAlign = 'left'
    c.fillStyle = COLOR.track
    round(c, P, y + 40, W - 2 * P, 14, 7)
    c.fill()
    if (frac > 0) {
      c.fillStyle = col
      round(c, P, y + 40, Math.max(14, (W - 2 * P) * Math.min(1, frac)), 14, 7)
      c.fill()
    }
    y += 74
  }

  if (s.cats.length) {
    title('Para onde foi o dinheiro')
    const max = s.cats[0].amount
    for (const ct of s.cats) bar(ct.name + (ct.card > EPS ? ' · cartão' : ''), money(ct.amount), max > 0 ? ct.amount / max : 0, COLOR.neg)
    y += 40
  }
  title('Contas, cartão e empréstimos')
  const kinds: [string, number, string][] = [
    ['Contas fixas', s.bills, '#6f9ee8'],
    ['Cartão', s.card, '#b58cf0'],
    ['Outros gastos', s.other, COLOR.neg],
  ]
  kinds.forEach(([label, v, col], i) => {
    const x = P + i * (bw + 20)
    c.fillStyle = col
    c.beginPath()
    c.arc(x + 10, y + 18, 9, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = COLOR.muted
    c.font = '600 24px Inter, sans-serif'
    c.fillText(label, x + 30, y + 27)
    c.fillStyle = COLOR.fg
    c.font = '700 30px Inter, sans-serif'
    c.fillText(money(v), x, y + 72)
  })
  y += 100
  c.fillStyle = COLOR.muted
  c.font = '600 26px Inter, sans-serif'
  c.fillText('Recebi de amigos: ' + money(s.loanIn), P, y + 20)
  c.textAlign = 'right'
  c.fillText('Paguei de dívidas: ' + money(s.loanOut), W - P, y + 20)
  c.textAlign = 'left'
  y += 90
  if (s.budgets.length) {
    title('Orçamento')
    for (const b of s.budgets) bar(b.name, money(b.spent) + ' / ' + money(b.limit), b.pct / 100, b.cls === 'over' ? COLOR.neg : b.cls === 'warn' ? COLOR.warn : COLOR.pos)
    y += 40
  }
  if (s.goals.length) {
    title('Metas')
    for (const g of s.goals) bar(g.name, money(g.saved) + ' / ' + money(g.target), g.pct / 100, COLOR.pos)
    y += 40
  }

  // recorta na altura certa e escreve o rodapé
  const H2 = Math.round(y + 90)
  const out = document.createElement('canvas')
  out.width = W
  out.height = H2
  const o = out.getContext('2d')!
  o.drawImage(cv, 0, 0)
  o.fillStyle = '#252a36'
  o.fillRect(P, H2 - 96, W - 2 * P, 2)
  o.fillStyle = '#5a6072'
  o.font = '500 22px Inter, sans-serif'
  o.textAlign = 'right'
  o.fillText(`gerado em ${dateText} · compras no cartão contam no mês da parcela`, W - P, H2 - 50)
  return out
}
