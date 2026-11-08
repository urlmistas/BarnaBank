import { lazy, Suspense, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CalendarCheck, CircleAlert, Clock, Inbox, TriangleAlert, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useMpTotal } from '@/app/use-mp-total'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dashboardAlert, dashboardSummary, upcomingItems, type DashboardAlert, type UpcomingItem } from '@/lib/finance/dashboard'
import { debtPlan } from '@/lib/finance/debt-plan'
import { nameKey } from '@/lib/finance/people'
import { briefHeadline, monthBrief, type MonthBrief } from '@/lib/finance/month-brief'
import { alertText, hideAlert, readHiddenAlerts, spendingAlerts, type SpendingAlert } from '@/lib/finance/alerts'
import { balanceSeries } from '@/lib/finance/wallets'
import { addDaysISO, parseISO, ymOf } from '@/lib/finance/dates'
import { categoryRanking, monthSpending } from '@/lib/finance/reports'
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
        brief: monthBrief(data, today),
        spending: spendingAlerts(data, today),
        series: data.wallets.length ? balanceSeries(data, addDaysISO(today, -29), today) : [],
      }
    }, [data, today])
    return (
      <div className="flex flex-col gap-6">
        <Hero summary={view.summary} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6">
            {view.alert && <AlertRow alert={view.alert} />}
            <MonthBriefCard brief={view.brief} today={today} />
            <PayNextCard data={data} today={today} />
            <SpendingAlerts alerts={view.spending} today={today} />
            <CategoryCard data={data} today={today} />
            <Upcoming items={view.items} />
          </div>
          <MonthCard summary={view.summary} series={view.series} />
        </div>
      </div>
    )
}

function Hero({ summary }: { summary: ReturnType<typeof dashboardSummary> }) {
  const { money } = useAppData()
  // o Mercado Pago entra pelo total do painel (conta + porquinhos), sem precisar de uma carteira no app
  const mp = useMpTotal()
  const balance = summary.balance + (mp ?? 0)
  const walletCount = summary.walletCount + (mp === null ? 0 : 1)
  const [main, cents] = splitCents(money(balance))
  return (
    <section aria-labelledby="saldo-titulo" className="pt-1 pb-2">
      <h1 id="saldo-titulo" className="text-sm font-medium text-fg-muted">
        Saldo em carteiras
        {walletCount > 0 && <span className="text-fg-subtle"> · {plural(walletCount, 'carteira', 'carteiras')}</span>}
      </h1>
      <p className={cn('num mt-2 text-4xl font-semibold tracking-tight', balance < 0 && 'text-neg')}>
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
      {walletCount === 0 && (
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
      <Button asChild variant="ghost" size="sm" className="group shrink-0">
        <Link to={late ? '/pessoas?f=atrasados' : '/pessoas'}>
          Ver <ArrowRight aria-hidden="true" className="transition-transform duration-200 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transition-none" />
        </Link>
      </Button>
    </div>
  )
}

/** resumo do mês: o que ainda vence até o fim do mês e se o saldo cobre */
function MonthBriefCard({ brief, today }: { brief: MonthBrief; today: string }) {
  const { money } = useAppData()
  if (brief.verdict === 'empty') return null
  const bad = brief.verdict === 'no'
  const Icon = bad ? CircleAlert : brief.verdict === 'tight' ? TriangleAlert : CalendarCheck
  const stats: [string, string][] = [
    ['A pagar até o fim do mês', money(brief.outTotal)],
    ['A receber', money(brief.inTotal)],
    ['Saldo previsto', money(brief.endBalance)],
  ]
  if (brief.perDay > 0) stats.push(['Livre por dia', money(brief.perDay)])
  return (
    <section aria-label={`Resumo de ${MONTHS[parseISO(today).getMonth()]}`} className="rounded-md border border-border bg-surface px-4 py-3">
      <p role="status" className="flex items-start gap-3 text-sm">
        <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', bad ? 'text-neg' : 'text-accent-text')} />
        <span className="font-medium">{briefHeadline(brief, money)}</span>
      </p>
      {brief.count > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-fg-muted">{k}</dt>
              <dd className={cn('num font-medium', k === 'Saldo previsto' && brief.endBalance < 0 && 'text-neg')}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {(brief.lateOut > 0 || brief.lateInCount > 0) && (
        <p className="mt-3 text-xs text-fg-muted">
          {brief.lateOut > 0 && <>Já vencido e ainda não pago: <span className="num">{money(brief.lateOut)}</span>. </>}
          {brief.lateInCount > 0 && <>{plural(brief.lateInCount, 'recebimento atrasado ficou', 'recebimentos atrasados ficaram')} fora da conta.</>}
        </p>
      )}
    </section>
  )
}

/** top categorias de gasto do mês, com a variação contra o mês passado */
function CategoryCard({ data, today }: { data: AppData; today: string }) {
  const { money } = useAppData()
  const rows = useMemo(() => {
    const ym = ymOf(today)
    const prev = ymOf(addDaysISO(today.slice(0, 7) + '-01', -1))
    return categoryRanking(monthSpending(data, ym), monthSpending(data, prev)).slice(0, 5)
  }, [data, today])
  if (!rows.length) return null
  const top = rows[0].amount
  return (
    <section aria-label={`Gastos de ${MONTHS[parseISO(today).getMonth()]} por categoria`} className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Gastos do mês por categoria</h2>
        <Link to="/relatorios?g=categorias" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          Ver tudo <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.name}</span>
              <span className="num shrink-0 font-medium">{money(r.amount)}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: Math.max(4, (r.amount / top) * 100) + '%' }} />
            </div>
            <p className="mt-0.5 text-xs text-fg-subtle">
              {Math.round(r.share * 100)}% dos gastos
              {r.prev > 0 && r.diff !== 0 && ` · ${r.diff > 0 ? '+' : '−'}${money(Math.abs(r.diff))} que mês passado`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

const PAY_LIMIT = 4

/** dívidas que eu devo, na ordem em que vencem (atrasadas primeiro): quanto sai e quando */
function PayNextCard({ data, today }: { data: AppData; today: string }) {
  const { money } = useAppData()
  const plan = useMemo(() => debtPlan(data, today), [data, today])
  const rows = useMemo(
    () => [...plan.debts].sort((a, b) => (a.nextDue ?? '9999') .localeCompare(b.nextDue ?? '9999') || a.name.localeCompare(b.name, 'pt-BR')),
    [plan],
  )
  if (!rows.length) return null
  const shown = rows.slice(0, PAY_LIMIT)
  const next = rows.reduce((t, d) => t + d.installment, 0)
  return (
    <section aria-labelledby="pagar-titulo" className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="pagar-titulo" className="text-sm font-medium">
          Próximos a pagar
        </h2>
        <p className="text-xs text-fg-muted">
          {plural(rows.length, 'dívida', 'dívidas')} · parcelas somam <span className="num">{money(next)}</span>
        </p>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {shown.map((d) => {
          const late = d.overdue > 0.005
          const when = !d.nextDue ? '' : late ? lateLabel(d.nextDue, today) : relativeDay(d.nextDue, today)
          return (
            <li key={d.id}>
              <Link
                to={'/pessoas/' + encodeURIComponent(nameKey(d.name))}
                className="-mx-2 flex items-center gap-3 rounded-sm px-2 py-2 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                aria-label={`${d.name}, ${when}, parcela ${money(d.installment)}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className={cn('block truncate text-xs', late ? 'text-neg' : 'text-fg-muted')}>
                    {when}
                    {d.installment < d.remaining - 0.005 && <span className="text-fg-subtle"> · falta {money(d.remaining)} no total</span>}
                  </span>
                </span>
                <span className="num shrink-0 text-sm font-medium text-neg">{money(d.installment)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      {rows.length > PAY_LIMIT && (
        <Link to="/pessoas?f=abertos" className="mt-2 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          Ver as outras {rows.length - PAY_LIMIT} <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      )}
    </section>
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
    <aside aria-labelledby="mes-titulo">
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
