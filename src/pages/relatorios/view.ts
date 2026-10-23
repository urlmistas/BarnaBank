import type { AppData, ISODate, YearMonth } from '@/lib/types'
import {
  balanceReport, cardsReport, categoryRanking, chartMonths, flowSeries, loansByPerson, mixSeries, periodIncome, periodSpending,
  type CatRow, type ReportRange,
} from '@/lib/finance/reports'
import { EPS, ymOf } from '@/lib/finance/dates'
import type { InvoiceStatus } from '@/lib/finance/bills-cards'
import { cardRouteId } from '@/lib/finance/contas'
import { personHref } from '@/pages/pessoas/links'
import { walletHref } from '@/pages/carteiras/links'
import { axisMonth, monthName, monthTitle, pctText, type ChartKind, type ChartSpec, type ColumnRow, type Series } from './spec'

// Monta o que cada aba de Relatórios mostra: gráfico (spec), tabela alternativa e lista ordenada.

export interface RankRow {
  key: string
  name: string
  value: number
  /** valor com sinal e cor (verde/vermelho) */
  signed?: boolean
  sub?: string
  href?: string
}

export interface TableView {
  head: string[]
  rows: { key: string; label: string; cells: number[]; muted?: boolean }[]
}

export interface ChartView {
  title: string
  sub?: string
  spec: ChartSpec | null
  /** texto do estado vazio quando não há o que desenhar no período */
  empty: string
  legend: { series: Series; total: number }[]
  /** algumas barras são de meses antes do período (esmaecidas) */
  dimmed: boolean
  ariaLabel: string
  table: TableView
  rank: { title: string; rows: RankRow[]; noun: [string, string] }
}

interface Ctx {
  data: AppData
  months: YearMonth[]
  prev: YearMonth[]
  range: ReportRange
  today: ISODate
  money: (v: number) => string
  periodText: string
  /** período anterior começa antes do primeiro dado: sem comparação */
  noBase: boolean
}

const STATUS: Record<InvoiceStatus, string> = { paga: 'paga', atrasada: 'atrasada', fechada: 'fechada', aberta: 'aberta', vazia: 'sem compras' }

function catSub(r: CatRow, noBase: boolean): string {
  const share = Math.round(r.share * 100) + '% do total'
  const delta = noBase ? 'sem base anterior' : r.prev > EPS ? pctText(r.diff / r.prev) + ' vs anterior' : 'novo no período'
  return `${share} · ${delta}`
}

function columnRows<T extends { key: YearMonth; inPeriod: boolean }>(pts: T[], pick: (p: T) => Record<string, number>): ColumnRow[] {
  const crosses = pts.length > 0 && pts[0].key.slice(0, 4) !== pts[pts.length - 1].key.slice(0, 4)
  return pts.map((p) => ({ label: axisMonth(p.key, crosses), full: monthTitle(p.key), inPeriod: p.inPeriod, values: pick(p) }))
}

function columnsTable(rows: ColumnRow[], series: Series[], withTotal: boolean): TableView {
  return {
    head: ['Mês', ...series.map((s) => s.name), ...(withTotal ? ['Total'] : [])],
    rows: rows.map((r) => {
      const cells = series.map((s) => r.values[s.key] ?? 0)
      return { key: r.full, label: r.full, cells: withTotal ? [...cells, cells.reduce((a, b) => a + b, 0)] : cells, muted: !r.inPeriod }
    }),
  }
}

const sumIn = (rows: ColumnRow[], key: string) => rows.filter((r) => r.inPeriod).reduce((s, r) => s + (r.values[key] ?? 0), 0)

/** no máximo 8 barras; o resto vira "Outras" */
function topBars(rows: { key: string; name: string; values: Record<string, number> }[], series: Series[]): ColumnRow[] {
  const head = rows.slice(0, rows.length > 8 ? 7 : 8)
  const rest = rows.slice(head.length)
  const out = head.map((r) => ({ label: r.name, full: r.name, inPeriod: true, values: r.values }))
  if (rest.length) {
    const values: Record<string, number> = {}
    for (const s of series) values[s.key] = rest.reduce((a, r) => a + (r.values[s.key] ?? 0), 0)
    out.push({ label: `Outras (${rest.length})`, full: `Outras ${rest.length}`, inPeriod: true, values })
  }
  return out
}

export function buildView(kind: ChartKind, c: Ctx): ChartView {
  const { data, months, prev, range, today, money, periodText } = c
  const chart = chartMonths(months, range)
  const dimmed = chart.some((m) => !m.inPeriod)

  switch (kind) {
    case 'fluxo': {
      const series: Series[] = [
        { key: 'income', name: 'Entradas', tone: 'accent' },
        { key: 'spending', name: 'Gastos', tone: 'gray' },
      ]
      const rows = columnRows(flowSeries(data, chart), (p) => ({ income: p.income, spending: p.spending }))
      const tin = sumIn(rows, 'income')
      const tout = sumIn(rows, 'spending')
      const inc = categoryRanking(periodIncome(data, months), periodIncome(data, prev))
      return {
        title: 'Entradas e gastos por mês',
        sub: 'Gastos incluem contas fixas pagas e parcelas do cartão no mês da compra',
        spec: tin + tout > EPS ? { type: 'columns', stacked: false, rows, series } : null,
        empty: `Nenhuma entrada ou gasto em ${periodText}.`,
        legend: series.map((s) => ({ series: s, total: s.key === 'income' ? tin : tout })),
        dimmed,
        ariaLabel: `Gráfico de colunas: entradas e gastos por mês, ${periodText}. Entradas ${money(tin)}, gastos ${money(tout)}.`,
        table: columnsTable(rows, series, false),
        rank: {
          title: 'Entradas por categoria',
          noun: ['categoria', 'categorias'],
          rows: inc.map((r) => ({ key: r.key, name: r.name, value: r.amount, sub: catSub(r, c.noBase) })),
        },
      }
    }
    case 'saldo': {
      const r = balanceReport(data, months, today)
      const pts = r.points
      const first = pts[0]
      const last = pts[pts.length - 1]
      const sampled = pts.length <= 31 ? pts : pts.filter((p, i) => i === pts.length - 1 || ymOf(pts[i + 1].date) !== ymOf(p.date))
      const lo = pts.length ? Math.min(...pts.map((p) => p.total)) : 0
      const hi = pts.length ? Math.max(...pts.map((p) => p.total)) : 0
      return {
        title: 'Saldo das carteiras',
        sub: first && last ? `de ${money(first.total)} para ${money(last.total)} · menor ${money(lo)}, maior ${money(hi)}` : undefined,
        spec: pts.length > 1 ? { type: 'line', points: pts } : null,
        empty: `Sem dias suficientes para o gráfico em ${periodText}.`,
        legend: [],
        dimmed: false,
        ariaLabel: first && last
          ? `Gráfico de linha: saldo somado das carteiras, ${periodText}: de ${money(first.total)} para ${money(last.total)}; menor ${money(lo)}, maior ${money(hi)}.`
          : 'Saldo das carteiras',
        table: {
          head: [pts.length <= 31 ? 'Dia' : 'Fim do mês', 'Saldo'],
          rows: sampled.map((p) => ({
            key: p.date,
            label: pts.length <= 31 ? p.date.split('-').reverse().join('/') : monthTitle(ymOf(p.date)),
            cells: [p.total],
          })),
        },
        rank: {
          title: 'Carteiras no fim do período',
          noun: ['carteira', 'carteiras'],
          rows: r.wallets.map((w) => ({
            key: w.id,
            name: w.name,
            value: w.end,
            sub: Math.abs(w.change) < EPS ? 'sem variação no período' : `${w.change > 0 ? '+' : '−'}${money(Math.abs(w.change))} no período`,
            href: walletHref(w.id, ''),
          })),
        },
      }
    }
    case 'categorias': {
      const cur = periodSpending(data, months)
      const ranking = categoryRanking(cur, periodSpending(data, prev))
      const series: Series[] = [{ key: 'amount', name: 'Gastos', tone: 'accent' }]
      const rows = topBars(ranking.map((r) => ({ key: r.key, name: r.name, values: { amount: r.amount } })), series)
      return {
        title: 'Gastos por categoria',
        sub: cur.card > EPS ? `Inclui ${money(cur.card)} no cartão, cada parcela no mês dela; o pagamento da fatura não conta de novo` : undefined,
        spec: ranking.length ? { type: 'bars', rows, series } : null,
        empty: `Nenhum gasto em ${periodText}.`,
        legend: [],
        dimmed: false,
        ariaLabel: `Gráfico de barras: gastos por categoria, ${periodText}. ${rows.slice(0, 3).map((r) => `${r.label} ${money(r.values.amount)}`).join('; ')}.`,
        table: {
          head: ['Categoria', 'Gastos', 'No cartão', 'Período anterior'],
          rows: ranking.map((r) => ({ key: r.key, label: r.name, cells: [r.amount, r.card, r.prev] })),
        },
        rank: {
          title: 'Maiores categorias',
          noun: ['categoria', 'categorias'],
          rows: ranking.map((r) => ({
            key: r.key,
            name: r.name,
            value: r.amount,
            sub: catSub(r, c.noBase) + (r.card > EPS ? ` · ${money(r.card)} no cartão` : ''),
          })),
        },
      }
    }
    case 'tipos': {
      const series: Series[] = [
        { key: 'bills', name: 'Contas fixas', tone: 'gray2' },
        { key: 'card', name: 'Cartão', tone: 'accent' },
        { key: 'other', name: 'Outros gastos', tone: 'gray' },
      ]
      const rows = columnRows(mixSeries(data, chart), (p) => ({ bills: p.bills, card: p.card, other: p.other }))
      const cur = periodSpending(data, months)
      const old = periodSpending(data, prev)
      const totals = { bills: cur.bills, card: cur.card, other: cur.other }
      return {
        title: 'Contas fixas, cartão e outros gastos',
        sub: 'Por mês, empilhados',
        spec: cur.total > EPS ? { type: 'columns', stacked: true, rows, series } : null,
        empty: `Nenhum gasto em ${periodText}.`,
        legend: series.map((s) => ({ series: s, total: totals[s.key as keyof typeof totals] })),
        dimmed,
        ariaLabel: `Gráfico de colunas empilhadas, ${periodText}: contas fixas ${money(cur.bills)}, cartão ${money(cur.card)}, outros gastos ${money(cur.other)}.`,
        table: columnsTable(rows, series, true),
        rank: {
          title: 'Tipos de gasto no período',
          noun: ['tipo', 'tipos'],
          rows: series
            .map((s) => {
              const k = s.key as keyof typeof totals
              const v = totals[k]
              const p = old[k]
              const share = cur.total > EPS ? Math.round((v / cur.total) * 100) + '% do total' : '—'
              return { key: s.key, name: s.name, value: v, sub: `${share} · ${!c.noBase && p > EPS ? pctText((v - p) / p) + ' vs anterior' : 'sem base anterior'}` }
            })
            .sort((a, b) => b.value - a.value),
        },
      }
    }
    case 'pessoas': {
      const r = loansByPerson(data, months)
      const series: Series[] = [
        { key: 'received', name: 'Recebido', tone: 'accent' },
        { key: 'paid', name: 'Pago', tone: 'gray' },
      ]
      const rows = topBars(r.rows.map((x) => ({ key: x.key, name: x.name, values: { received: x.received, paid: x.paid } })), series)
      return {
        title: 'Empréstimos: recebido e pago por pessoa',
        sub: 'Pagamentos de dívidas lançados no período',
        spec: r.rows.length ? { type: 'bars', rows, series } : null,
        empty: `Nenhum pagamento de empréstimo em ${periodText}.`,
        legend: [
          { series: series[0], total: r.received },
          { series: series[1], total: r.paid },
        ],
        dimmed: false,
        ariaLabel: `Gráfico de barras por pessoa, ${periodText}: recebido ${money(r.received)}, pago ${money(r.paid)}.`,
        table: { head: ['Pessoa', 'Recebido', 'Pago'], rows: r.rows.map((x) => ({ key: x.key, label: x.name, cells: [x.received, x.paid] })) },
        rank: {
          title: 'Pessoas no período',
          noun: ['pessoa', 'pessoas'],
          rows: r.rows.map((x) => ({
            key: x.key,
            name: x.name,
            value: x.received - x.paid,
            signed: true,
            sub: [x.received > EPS && `recebido ${money(x.received)}`, x.paid > EPS && `pago ${money(x.paid)}`].filter(Boolean).join(' · '),
            href: personHref(x.key, ''),
          })),
        },
      }
    }
    case 'cartoes': {
      const r = cardsReport(data, months, chart, today)
      const series: Series[] = [{ key: 'charges', name: 'Compras nas faturas', tone: 'accent' }]
      const rows = columnRows(r.series, (p) => ({ charges: p.charges }))
      return {
        title: 'Compras nas faturas, por mês',
        sub: 'Todas as faturas somadas, sem o saldo que passou de uma para outra',
        spec: r.charges > EPS ? { type: 'columns', stacked: false, rows, series } : null,
        empty: `Nenhuma compra nas faturas de ${periodText}.`,
        legend: [],
        dimmed,
        ariaLabel: `Gráfico de colunas: compras nas faturas por mês, ${periodText}. Total ${money(r.charges)}; pago ${money(r.paid)}.`,
        table: columnsTable(rows, series, false),
        rank: {
          title: 'Cartões',
          noun: ['cartão', 'cartões'],
          rows: r.rows.map((x) => ({
            key: x.id,
            name: x.name,
            value: x.charges,
            sub:
              `fatura de ${monthName(x.lastKey)} ${money(x.lastTotal)} · ${STATUS[x.lastStatus]}` +
              (x.limit > 0 ? ` · limite usado ${Math.min(100, Math.round((x.used / x.limit) * 100))}%` : ''),
            href: '/contas/' + encodeURIComponent(cardRouteId(x.id)) + '?m=' + x.lastKey,
          })),
        },
      }
    }
  }
}
