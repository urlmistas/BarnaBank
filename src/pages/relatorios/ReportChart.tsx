import type { CSSProperties, ReactElement } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps,
} from 'recharts'
import { useAppData } from '@/app/data-context'
import { parseISO } from '@/lib/finance/dates'
import { MONTHS } from '@/lib/format'
import { useMediaQuery } from '@/lib/use-media-query'
import { compactNumber, TONE_VAR, type ChartSpec, type ColumnRow, type Series } from './spec'

// Gráfico de Relatórios (Recharts, carregado sob demanda). Marcas finas, grade discreta,
// tooltip em todas as formas; animação só sem prefers-reduced-motion.

const AXIS = { fontSize: 12, fill: 'var(--fg-subtle)' }
const DIM = 0.35

type Flat = { label: string; full: string; inPeriod: boolean } & Record<string, number | string | boolean>
const flatten = (rows: ColumnRow[]): Flat[] => rows.map((r) => ({ label: r.label, full: r.full, inPeriod: r.inPeriod, ...r.values }))

function Tip({ active, payload, series, stacked }: Partial<TooltipContentProps<number, string>> & { series: Series[]; stacked?: boolean }) {
  const { money } = useAppData()
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Flat
  const total = series.reduce((s, x) => s + (Number(row[x.key]) || 0), 0)
  return (
    <div className="min-w-40 rounded-sm border border-border bg-surface px-2.5 py-2 text-xs">
      <div className="mb-1 text-fg-muted first-letter:uppercase">
        {row.full}
        {!row.inPeriod && <span className="text-fg-subtle"> · fora do período</span>}
      </div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-fg-muted">
            {series.length > 1 && <i aria-hidden="true" className="inline-block size-2 rounded-[2px]" style={{ background: TONE_VAR[s.tone] }} />}
            {s.name}
          </span>
          <span className="num font-medium text-fg">{money(Number(row[s.key]) || 0)}</span>
        </div>
      ))}
      {stacked && series.length > 1 && (
        <div className="mt-1 flex justify-between gap-4 border-t border-border pt-1">
          <span className="text-fg-muted">Total</span>
          <span className="num font-medium text-fg">{money(total)}</span>
        </div>
      )}
    </div>
  )
}

function LineTip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  const { money, date } = useAppData()
  if (!active || !payload?.length) return null
  const p = payload[0].payload as { date: string; total: number }
  return (
    <div className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs">
      <div className="num text-fg-muted">{date(p.date)}</div>
      <div className="num font-medium text-fg">{money(p.total)}</div>
    </div>
  )
}

export function ReportChart({ spec, label, className, style }: { spec: ChartSpec; label: string; className?: string; style?: CSSProperties }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const narrow = useMediaQuery('(max-width: 639px)')
  const anim = !reduced
  const grid = <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
  const yTicks = { ...AXIS, fontVariantNumeric: 'tabular-nums' } as const

  let chart: ReactElement
  if (spec.type === 'line') {
    const pts = spec.points
    // até ~2 meses: dias espaçados ("5 out"); mais que isso: um tick no 1º dia de cada mês ("out")
    const long = pts.length > 62
    const monthStarts = pts.filter((p) => p.date.endsWith('-01')).map((p) => p.date)
    const step = Math.max(1, Math.ceil(monthStarts.length / (narrow ? 4 : 12)))
    const ticks = long ? monthStarts.filter((_, i) => i % step === 0) : undefined
    const tickEvery = Math.max(1, Math.ceil(pts.length / (narrow ? 4 : 7)))
    const dayTick = (iso: string) => {
      const d = parseISO(iso)
      const m = MONTHS[d.getMonth()].slice(0, 3)
      return long ? m : `${d.getDate()} ${m}`
    }
    chart = (
      <LineChart data={pts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {grid}
        <XAxis dataKey="date" tickFormatter={dayTick} ticks={ticks} interval={long ? 0 : tickEvery - 1} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={12} />
        <YAxis tickFormatter={compactNumber} tick={yTicks} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} />
        <Tooltip content={<LineTip />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} isAnimationActive={false} />
        <Line
          type="linear"
          dataKey="total"
          name="Saldo"
          stroke="var(--chart-accent)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--chart-accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
          isAnimationActive={anim}
          animationDuration={400}
        />
      </LineChart>
    )
  } else if (spec.type === 'bars') {
    // barras horizontais (ranking): nomes no eixo, valores no tooltip e na lista abaixo
    const rows = flatten(spec.rows)
    chart = (
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
        <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
        <XAxis type="number" tickFormatter={compactNumber} tick={yTicks} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          width={narrow ? 92 : 132}
          tickFormatter={(v: string) => (v.length > (narrow ? 12 : 18) ? v.slice(0, narrow ? 11 : 17) + '…' : v)}
        />
        <Tooltip content={<Tip series={spec.series} />} cursor={{ fill: 'var(--surface-2)' }} isAnimationActive={false} />
        {spec.series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={TONE_VAR[s.tone]} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={anim} animationDuration={400} />
        ))}
      </BarChart>
    )
  } else {
    const rows = flatten(spec.rows)
    const last = spec.series.length - 1
    chart = (
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={spec.stacked ? '28%' : '22%'} barGap={2}>
        {grid}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval={narrow && rows.length > 6 ? 1 : 0} />
        <YAxis tickFormatter={compactNumber} tick={yTicks} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={<Tip series={spec.series} stacked={spec.stacked} />} cursor={{ fill: 'var(--surface-2)' }} isAnimationActive={false} />
        {spec.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId={spec.stacked ? 'a' : undefined}
            fill={TONE_VAR[s.tone]}
            // empilhado: só o topo é arredondado; fresta de 2px na cor da superfície entre os segmentos
            radius={!spec.stacked || i === last ? [4, 4, 0, 0] : 0}
            stroke={spec.stacked ? 'var(--surface)' : undefined}
            strokeWidth={spec.stacked ? 2 : 0}
            maxBarSize={spec.stacked ? 44 : 28}
            isAnimationActive={anim}
            animationDuration={400}
          >
            {rows.map((r) => (
              <Cell key={r.label} fillOpacity={r.inPeriod ? 1 : DIM} />
            ))}
          </Bar>
        ))}
      </BarChart>
    )
  }

  return (
    <div role="img" aria-label={label} className={className} style={style}>
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </div>
  )
}
