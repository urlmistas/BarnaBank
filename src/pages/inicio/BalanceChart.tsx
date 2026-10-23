import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { useAppData } from '@/app/data-context'
import { relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Point {
  date: string
  total: number
}

function ChartTip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  const { money, today } = useAppData()
  if (!active || !payload?.length) return null
  const p = payload[0].payload as Point
  return (
    <div className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs">
      <div className="text-fg-muted">{relativeDay(p.date, today)}</div>
      <div className="num font-medium text-fg">{money(p.total)}</div>
    </div>
  )
}

/** Uma série só (saldo acumulado); sem legenda — o título do cartão nomeia a série. */
export function BalanceChart({ points, label, className = 'h-24' }: { points: Point[]; label: string; className?: string }) {
  const values = points.map((p) => p.total)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.12 || 1
  return (
    <div role="img" aria-label={label} className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 2, bottom: 2, left: 2 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[min - pad, max + pad]} />
          <Tooltip
            content={<ChartTip />}
            cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="total"
            stroke="var(--accent-text)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--accent-text)', stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
