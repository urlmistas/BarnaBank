import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { useAppData } from '@/app/data-context'
import { balanceSeries, monthlyPayments, punctuality, type BalancePoint } from '@/lib/finance/person-facts'
import type { PersonDetail } from '@/lib/finance/people'
import { plural } from '@/lib/format'
import { useMediaQuery } from '@/lib/use-media-query'
import { compactNumber } from '../relatorios/spec'

// Gráficos da pessoa (Recharts, carregado sob demanda): pagamentos mês a mês e pontualidade das parcelas pagas.

const AXIS = { fontSize: 12, fill: 'var(--fg-subtle)' }
const Y_TICKS = { ...AXIS, fontVariantNumeric: 'tabular-nums' } as const

type Point = ReturnType<typeof monthlyPayments>[number]

function Tip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  const { money } = useAppData()
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Point
  return (
    <div className="min-w-40 rounded-sm border border-border bg-surface px-2.5 py-2 text-xs">
      <div className="mb-1 text-fg-muted">{row.full}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-fg-muted">
          <i aria-hidden="true" className="inline-block size-2 rounded-[2px] bg-[var(--chart-accent)]" />
          Recebi
        </span>
        <span className="num font-medium text-fg">{money(row.in)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-fg-muted">
          <i aria-hidden="true" className="inline-block size-2 rounded-[2px] bg-[var(--chart-gray)]" />
          Paguei
        </span>
        <span className="num font-medium text-fg">{money(row.out)}</span>
      </div>
    </div>
  )
}

function BalanceTip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  const { money, date } = useAppData()
  if (!active || !payload?.length) return null
  const row = payload[0].payload as BalancePoint
  return (
    <div className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs">
      <div className="num text-fg-muted">{date(row.date)}</div>
      <div className="num font-medium text-fg">{money(row.balance)}</div>
    </div>
  )
}

const MONTH_TICK = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const dateTick = (iso: string) => `${MONTH_TICK[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`

export function PersonChart({ p }: { p: PersonDetail }) {
  const { today, money } = useAppData()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const points = monthlyPayments(p.history, today, 12)
  const any = points.some((x) => x.in > 0 || x.out > 0)
  const pt = punctuality(p)
  const balance = balanceSeries(p, today)
  const totalIn = points.reduce((s, x) => s + x.in, 0)
  const totalOut = points.reduce((s, x) => s + x.out, 0)

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Pagamentos por mês" className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Pagamentos por mês</h2>
          <p className="num text-xs text-fg-muted">
            últimos 12 meses · recebi {money(totalIn)}
            {totalOut > 0.005 && ` · paguei ${money(totalOut)}`}
          </p>
        </div>
        {any ? (
          <div className="mt-3 h-56" role="img" aria-label={`Pagamentos de ${p.name} nos últimos 12 meses: recebi ${money(totalIn)} e paguei ${money(totalOut)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tickFormatter={compactNumber} tick={Y_TICKS} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-2)' }} isAnimationActive={false} />
                <Bar dataKey="in" name="Recebi" fill="var(--chart-accent)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={!reduced} animationDuration={400} />
                {p.hasPayable && <Bar dataKey="out" name="Paguei" fill="var(--chart-gray)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={!reduced} animationDuration={400} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">Ainda não há pagamentos nos últimos 12 meses.</p>
        )}
      </section>

      {balance.length > 1 && (
        <section aria-label="Evolução do saldo" className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">Evolução do saldo</h2>
            <p className="text-xs text-fg-muted">a receber menos o que eu devo (aproximado)</p>
          </div>
          <div className="mt-3 h-56" role="img" aria-label={`Evolução do saldo de ${p.name}: hoje ${money(balance[balance.length - 1].balance)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balance} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dateTick} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={24} />
                <YAxis tickFormatter={compactNumber} tick={Y_TICKS} tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} />
                <Tooltip content={<BalanceTip />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} isAnimationActive={false} />
                <Line
                  type="stepAfter"
                  dataKey="balance"
                  name="Saldo"
                  stroke="var(--chart-accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--chart-accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={!reduced}
                  animationDuration={400}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section aria-label="Pontualidade" className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">Pontualidade das parcelas pagas</h2>
        {pt.total === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">Nenhuma parcela paga ainda.</p>
        ) : (
          <>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${pt.onTime + pt.early} de ${plural(pt.total, 'parcela', 'parcelas')} em dia, ${pt.late} atrasadas`}>
              {pt.early > 0 && <span style={{ flex: pt.early }} className="bg-pos" />}
              {pt.onTime > 0 && <span style={{ flex: pt.onTime }} className="bg-pos/60" />}
              {pt.late > 0 && <span style={{ flex: pt.late }} className="bg-neg" />}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
              <li className="flex items-center gap-1.5">
                <i aria-hidden="true" className="inline-block size-2 rounded-[2px] bg-pos" />
                Adiantadas <b className="num font-medium text-fg">{pt.early}</b>
              </li>
              <li className="flex items-center gap-1.5">
                <i aria-hidden="true" className="inline-block size-2 rounded-[2px] bg-pos/60" />
                No dia <b className="num font-medium text-fg">{pt.onTime}</b>
              </li>
              <li className="flex items-center gap-1.5">
                <i aria-hidden="true" className="inline-block size-2 rounded-[2px] bg-neg" />
                Atrasadas <b className="num font-medium text-fg">{pt.late}</b>
              </li>
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
