import type { ISODate, YearMonth } from '@/lib/types'
import type { ReportPeriod } from '@/lib/finance/reports'
import { MONTHS } from '@/lib/format'

// Tipos e textos compartilhados entre a página (sem Recharts) e o gráfico (carregado sob demanda).

export type ChartKind = 'fluxo' | 'saldo' | 'categorias' | 'tipos' | 'pessoas' | 'cartoes'
export const CHART_KINDS: ChartKind[] = ['fluxo', 'saldo', 'categorias', 'tipos', 'pessoas', 'cartoes']

export const CHART_LABEL: Record<ChartKind, string> = {
  fluxo: 'Entrou × saiu',
  saldo: 'Saldo',
  categorias: 'Categorias',
  tipos: 'Fixas × cartão',
  pessoas: 'Empréstimos',
  cartoes: 'Cartões',
}

export const PERIOD_LABEL: Record<ReportPeriod, string> = { mes: 'Mês', '3m': '3 meses', '12m': '12 meses', ano: 'Ano' }

/** cor de uma série: o dourado e dois cinzas (tokens --chart-*) */
export type Tone = 'accent' | 'gray' | 'gray2'
export const TONE_VAR: Record<Tone, string> = {
  accent: 'var(--chart-accent)',
  gray: 'var(--chart-gray)',
  gray2: 'var(--chart-gray-2)',
}

export interface Series {
  key: string
  name: string
  tone: Tone
}

export interface ColumnRow {
  /** rótulo curto do eixo ("out") */
  label: string
  /** rótulo completo (tooltip e tabela: "outubro de 2026") */
  full: string
  inPeriod: boolean
  values: Record<string, number>
}

export type ChartSpec =
  | { type: 'columns'; stacked: boolean; rows: ColumnRow[]; series: Series[] }
  | { type: 'bars'; rows: ColumnRow[]; series: Series[] }
  | { type: 'line'; points: { date: ISODate; total: number }[] }

const short = (ym: YearMonth) => MONTHS[+ym.slice(5, 7) - 1].slice(0, 3)
export const monthTitle = (ym: YearMonth) => `${MONTHS[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`
export const monthName = (ym: YearMonth) => MONTHS[+ym.slice(5, 7) - 1]

/** "set" — com o ano quando o gráfico cruza a virada ("jan 26") */
export function axisMonth(ym: YearMonth, crossesYear: boolean) {
  return crossesYear ? `${short(ym)} ${ym.slice(2, 4)}` : short(ym)
}

/** "outubro de 2026", "ago – out 2026", "nov 2025 – out 2026", "2026 (jan – out)" */
export function periodTitle(kind: ReportPeriod, months: YearMonth[]): string {
  if (!months.length) return ''
  const a = months[0]
  const b = months[months.length - 1]
  if (kind === 'mes') return monthTitle(b)
  if (kind === 'ano') return b.endsWith('-12') && a.endsWith('-01') ? a.slice(0, 4) : `${a.slice(0, 4)} (${short(a)} – ${short(b)})`
  if (a.slice(0, 4) === b.slice(0, 4)) return `${short(a)} – ${short(b)} ${b.slice(0, 4)}`
  return `${short(a)} ${a.slice(0, 4)} – ${short(b)} ${b.slice(0, 4)}`
}

/** "setembro", "os 3 meses anteriores", "2025 (jan – out)" — complemento de "vs …" */
export function previousTitle(kind: ReportPeriod, prev: YearMonth[]): string {
  if (!prev.length) return ''
  if (kind === 'mes') return monthName(prev[0])
  if (kind === 'ano') return periodTitle('ano', prev)
  return `os ${prev.length} meses anteriores`
}

/** compacto para o eixo: 1,2 mil / 15 mil */
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
export const compactNumber = (v: number) => compact.format(v)

/** "+12%" / "−8%" (sinal de menos tipográfico) */
export function pctText(p: number): string {
  const n = Math.round(p * 100)
  if (n === 0) return '0%'
  return (n > 0 ? '+' : '−') + Math.abs(n) + '%'
}
