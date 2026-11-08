import { cn } from '@/lib/utils'

// Linha simples da evolução do total do Mercado Pago (um ponto por dia). Só SVG: sem biblioteca, sem eixos soltos.
export function TotalChart({ points, money, className }: { points: { d: string; total: number }[]; money: (v: number) => string; className?: string }) {
  if (points.length < 2) return null
  const W = 600
  const H = 80
  const PAD = 4
  const vals = points.map((p) => p.total)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1)
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD)
  const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.total).toFixed(1)).join(' ')
  const area = line + ' L' + x(points.length - 1).toFixed(1) + ' ' + H + ' L' + x(0).toFixed(1) + ' ' + H + ' Z'
  const first = points[0]!
  const last = points[points.length - 1]!
  const delta = Math.round((last.total - first.total) * 100) / 100
  const day = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)
  return (
    <figure className={cn('rounded-lg border border-border p-4', className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Evolução do total · {points.length} dias</span>
        <span className={cn('num text-xs', delta > 0 ? 'text-pos' : 'text-fg-muted')}>
          {(delta > 0 ? '+' : delta < 0 ? '−' : '') + money(Math.abs(delta))} desde {day(first.d)}
        </span>
      </figcaption>
      <svg role="img" aria-label={'Total do Mercado Pago de ' + day(first.d) + ' a ' + day(last.d) + ': de ' + money(first.total) + ' para ' + money(last.total)} viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" className="mt-3 h-20 w-full text-accent-text">
        <path d={area} fill="currentColor" opacity="0.12" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-subtle">
        <span>
          {day(first.d)} · <span className="num">{money(first.total)}</span>
        </span>
        <span>
          {day(last.d)} · <span className="num">{money(last.total)}</span>
        </span>
      </div>
    </figure>
  )
}
