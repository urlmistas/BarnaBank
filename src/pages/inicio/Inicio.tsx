import { lazy, Suspense, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CircleAlert, Clock, Inbox, TriangleAlert, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dashboardAlert, dashboardSummary, upcomingItems, type DashboardAlert, type UpcomingItem } from '@/lib/finance/dashboard'
import { alertText, hideAlert, readHiddenAlerts, spendingAlerts, type SpendingAlert } from '@/lib/finance/alerts'
import { balanceSeries } from '@/lib/finance/wallets'
import { addDaysISO, parseISO, ymOf } from '@/lib/finance/dates'
import { MONTHS, lateLabel, plural, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppData } from '@/lib/types'

// Recharts só carrega quando o cartão do mês tem gráfico (divide o bundle)
const BalanceChart = lazy(() => import('./BalanceChart').then((m) => ({ default: m.BalanceChart })))

const LIST_LIMIT = 5

/** "R$ 12.345,67" → ["R$ 12.345", ",67"] para os centavos ficarem discretos */
function splitCents(s: string): [string, string] {
  const m = s.match(/^(.*?)([.,]\d{2})(\D*)$/)
  return m ? [m[1], m[2] + m[3]] : [s, '']
}

export function Inicio() {
  const { status, result, today } = useAppData()
  if (status === 'loading' || !result) return <InicioSkeleton />
  return <InicioReady data={result.data} today={today} />
}

function InicioReady({ data, today }: { data: AppData; today: string }) {
    const view = useMemo(() => {
      const items = upcomingItems(data, today)
      return {
        items,
        alert: dashboardAlert(items, today),
        summary: dashboardSummary(data, today),
        spending: spendingAlerts(data, today),
        series: data.wallets.length ? balanceSeries(data, addDaysISO(today, -29), today) : [],
      }
    }, [data, today])
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Hero summary={view.summary} />
          {view.alert && <AlertRow alert={view.alert} />}
          <SpendingAlerts alerts={view.spending} today={today} />
          <Upcoming items={view.items} />
        </div>
        <MonthCard summary={view.summary} series={view.series} />
      </div>
    )
}

function Hero({ summary }: { summary: ReturnType<typeof dashboardSummary> }) {
  const { money } = useAppData()
  const [main, cents] = splitCents(money(summary.balance))
  return (
    <section aria-labelledby="saldo-titulo" className="pt-1 pb-2">
      <h1 id="saldo-titulo" className="text-sm font-medium text-fg-muted">
        Saldo em carteiras
        {summary.walletCount > 0 && <span className="text-fg-subtle"> · {plural(summary.walletCount, 'carteira', 'carteiras')}</span>}
      </h1>
      <p className={cn('num mt-2 text-4xl font-semibold tracking-tight', summary.balance < 0 && 'text-neg')}>
        {main}
        <span className="text-fg-subtle">{cents}</span>
      </p>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-fg-muted">A receber</dt>
          <dd className="num font-medium">{money(summary.toReceive)}</dd>
        </div>
        {summary.toPay > 0.005 && (
          <div className="flex gap-1.5">
            <dt className="text-fg-muted">Eu devo</dt>
            <dd className="num font-medium">{money(summary.toPay)}</dd>
          </div>
        )}
      </dl>
      {summary.walletCount === 0 && (
        <p className="mt-3 text-sm text-fg-subtle">Nenhuma carteira cadastrada. O saldo aparece quando houver carteiras.</p>
      )}
    </section>
  )
}

function AlertRow({ alert }: { alert: DashboardAlert }) {
  const { money } = useAppData()
  const late = alert.tone === 'late'
  const names = alert.names.slice(0, 3).join(', ') + (alert.names.length > 3 ? ` e mais ${alert.names.length - 3}` : '')
  const Icon = late ? CircleAlert : Clock
  return (
    <div role="status" className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', late ? 'text-neg' : 'text-accent-text')} />
      <p className="min-w-0 flex-1 text-sm">
        <span className="block font-medium sm:inline">
          {late ? plural(alert.count, 'vencimento atrasado', 'vencimentos atrasados') : plural(alert.count, 'vence hoje', 'vencem hoje')}
        </span>
        <span className="block truncate text-fg-muted sm:inline">
          <span className="hidden sm:inline"> · </span>
          <span className="num">{money(alert.total)}</span>
          <span className="text-fg-subtle"> · {names}</span>
        </span>
      </p>
      <Button asChild variant="ghost" size="sm" className="shrink-0">
        <Link to="/pessoas">
          Ver <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  )
}

/** categorias do mês que passaram muito da média (até 4); "Já sei" esconde a categoria até o mês acabar */
function SpendingAlerts({ alerts, today }: { alerts: SpendingAlert[]; today: string }) {
  const { money } = useAppData()
  const month = ymOf(today)
  const [hidden, setHidden] = useState(() => readHiddenAlerts())
  const list = alerts.filter((a) => hidden[month + ':' + a.key] !== 1).slice(0, 4)
  if (!list.length) return null
  return (
    <section aria-label="Gastos fora do padrão" className="rounded-md border border-border bg-surface">
      <h2 className="flex items-center gap-2 px-4 pt-3 text-sm font-medium">
        <TriangleAlert aria-hidden="true" className="size-4 text-accent-text" />
        Gastos fora do padrão em {MONTHS[parseISO(today).getMonth()]}
      </h2>
      <ul className="mt-1 pb-1">
        {list.map((a) => (
          <li key={a.key} className="flex items-center gap-3 px-4 py-2">
            <p className="min-w-0 flex-1 text-sm">
              <b className="font-medium">{a.name}</b> <span className="num">{money(a.cur)}</span>
              <span className="block text-xs text-fg-muted">{alertText(a, money)}</span>
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Esconder o alerta de ${a.name}`}
              title="Já sei, esconder"
              onClick={() => {
                hideAlert(month, a.key)
                setHidden(readHiddenAlerts())
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Upcoming({ items }: { items: UpcomingItem[] }) {
  const { money } = useAppData()
  const [all, setAll] = useState(false)
  const listId = useId()
  const shown = all ? items : items.slice(0, LIST_LIMIT)
  const totals = items.reduce(
    (t, it) => (it.dir === 'in' ? { ...t, in: t.in + it.amount } : { ...t, out: t.out + it.amount }),
    { in: 0, out: 0 },
  )
  return (
    <Card aria-labelledby="prox-titulo">
      <CardHeader className="flex-wrap gap-y-1">
        <CardTitle id="prox-titulo" className="whitespace-nowrap">
          Próximos 7 dias
        </CardTitle>
        {items.length > 0 && (
          <p className="num text-xs whitespace-nowrap text-fg-muted">
            {totals.in > 0 && <>entra {money(totals.in)}</>}
            {totals.in > 0 && totals.out > 0 && ' · '}
            {totals.out > 0 && <>sai {money(totals.out)}</>}
          </p>
        )}
      </CardHeader>
      {items.length === 0 ? (
        <CardContent>
          <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
            <Inbox aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
            Nada vencendo nos próximos 7 dias.
          </div>
        </CardContent>
      ) : (
        <>
          <ul id={listId} className="border-t border-border">
            <AnimatePresence initial={false}>
              {shown.map((it, i) => (
                <motion.li
                  key={it.key}
                  initial={i >= LIST_LIMIT ? { opacity: 0, height: 0 } : false}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                  className="overflow-hidden border-b border-border last:border-b-0"
                >
                  <UpcomingRow item={it} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {items.length > LIST_LIMIT && (
            <div className="border-t border-border px-2 py-1.5">
              <Button variant="ghost" size="sm" aria-expanded={all} aria-controls={listId} onClick={() => setAll((v) => !v)} className="w-full">
                {all ? 'Mostrar menos' : `Ver tudo (${items.length})`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function UpcomingRow({ item }: { item: UpcomingItem }) {
  const { money, today } = useAppData()
  const sign = item.dir === 'in' ? '+' : '−'
  const when = item.late ? lateLabel(item.date, today) : relativeDay(item.date, today)
  return (
    <Link
      to={item.to}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:grid-cols-[128px_minmax(0,1fr)_auto]"
      aria-label={`${item.title}, ${item.context}, ${when}, ${item.dir === 'in' ? 'a receber' : 'a pagar'} ${money(item.amount)}`}
    >
      <span className={cn('hidden whitespace-nowrap text-sm sm:block', item.late ? 'text-neg' : 'text-fg-muted')}>{when}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-fg-subtle">
          <span className={cn('sm:hidden', item.late && 'text-neg')}>{when} · </span>
          {item.context}
        </span>
      </span>
      <span className={cn('num text-sm font-medium', item.dir === 'in' ? 'text-pos' : 'text-neg')}>
        {sign}
        {money(item.amount)}
      </span>
    </Link>
  )
}

function MonthCard({ summary, series }: { summary: ReturnType<typeof dashboardSummary>; series: { date: string; total: number }[] }) {
  const { money, today } = useAppData()
  const month = MONTHS[parseISO(today).getMonth()]
  const net = summary.monthNet
  return (
    <aside aria-labelledby="mes-titulo" className="lg:pt-1">
      <Card>
        <CardHeader>
          <CardTitle id="mes-titulo" className="first-letter:uppercase">
            {month}
          </CardTitle>
          <Button asChild variant="link" size="sm">
            <Link to="/relatorios">Relatórios</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-3">
            <Figure label="Entrou" value={money(summary.monthIn)} />
            <Figure label="Saiu" value={money(summary.monthOut)} />
            <Figure label="Sobrou" value={money(net)} tone={net > 0.005 ? 'pos' : net < -0.005 ? 'neg' : undefined} />
          </dl>
          {series.length > 1 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs text-fg-muted">Saldo nos últimos 30 dias</p>
              <Suspense fallback={<Skeleton className="h-24 w-full" />}>
                <BalanceChart
                  points={series}
                  label={`Saldo nos últimos 30 dias: de ${money(series[0].total)} para ${money(series[series.length - 1].total)}`}
                />
              </Suspense>
            </div>
          )}
        </CardContent>
      </Card>
    </aside>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className={cn('num mt-1 truncate text-sm font-medium', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')} title={value}>
        {value}
      </dd>
    </div>
  )
}

function InicioSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="flex flex-col gap-6">
        <div className="pt-1 pb-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-3 h-10 w-64" />
          <Skeleton className="mt-4 h-4 w-52" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="mt-4 h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="h-64 rounded-lg border border-border bg-surface p-5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-4 h-10 w-full" />
      </div>
    </div>
  )
}
