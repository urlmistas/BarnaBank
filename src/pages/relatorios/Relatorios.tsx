import { lazy, Suspense, useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChartColumn, ChevronLeft, ChevronRight, CircleAlert, Table2 } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { TabPanel, Tabs } from '@/components/ui/tabs'
import {
  clampAnchor, pctChange, periodMonths, periodSummary, previousMonths, reportRange, REPORT_PERIODS, stepAnchor,
  type ReportPeriod, type ReportRange,
} from '@/lib/finance/reports'
import { EPS, ymOf } from '@/lib/finance/dates'
import { cn } from '@/lib/utils'
import type { AppData, YearMonth } from '@/lib/types'
import { CHART_KINDS, CHART_LABEL, monthTitle, PERIOD_LABEL, pctText, periodTitle, previousTitle, TONE_VAR, type ChartKind } from './spec'
import { buildView, type ChartView, type RankRow } from './view'

// Relatórios: período (mês / 3 meses / 12 meses / ano), três medidas e UM gráfico por vez,
// escolhido nas abas, com tabela alternativa e lista ordenada abaixo.
// Tudo na URL: ?p=3m&m=AAAA-MM&g=categorias&ver=tabela (padrões saem da URL).

const ReportChart = lazy(() => import('./ReportChart').then((m) => ({ default: m.ReportChart })))
const YM_RE = /^\d{4}-\d{2}$/
const MAX_ROWS = 8

export function Relatorios() {
  const { status, result, today } = useAppData()
  if (status === 'loading' || !result) return <RelatoriosSkeleton />
  return <RelatoriosReady data={result.data} today={today} />
}

function RelatoriosReady({ data, today }: { data: AppData; today: string }) {
  const range = useMemo(() => reportRange(data, today), [data, today])
  if (!range) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <div className="mt-6">
          <NoData />
        </div>
      </div>
    )
  }
  return <Report data={data} today={today} range={range} />
}

function Report({ data, today, range }: { data: AppData; today: string; range: ReportRange }) {
  const { money } = useAppData()
  const [params, setParams] = useSearchParams()
  const now = ymOf(today)

  const rawP = params.get('p')
  const rawM = params.get('m')
  const rawG = params.get('g')
  const asTable = params.get('ver') === 'tabela'

  const { kind, anchor, chart, available, months, periodText, prevText, prevOutside, summary, before, view } = useMemo(() => {
    const kind: ReportPeriod = REPORT_PERIODS.find((p) => p === rawP) ?? 'mes'
    const anchor = clampAnchor(kind, rawM && YM_RE.test(rawM) ? rawM : now, range)
    // abas sem nenhum dado de origem somem (sem carteira não há saldo, etc.)
    const available = CHART_KINDS.filter(
      (k) => (k !== 'saldo' || data.wallets.length > 0) && (k !== 'pessoas' || data.debts.length > 0) && (k !== 'cartoes' || data.cards.length > 0),
    )
    const chart: ChartKind = available.find((k) => k === rawG) ?? 'fluxo'
    const months = periodMonths(kind, anchor, today)
    const prev = previousMonths(kind, months)
    const periodText = periodTitle(kind, months)
    // período anterior só serve de base se estiver inteiro dentro dos dados
    const noBase = prev[0] < range.min
    return {
      kind,
      anchor,
      chart,
      available,
      months,
      periodText,
      prevText: previousTitle(kind, prev),
      prevOutside: noBase,
      summary: periodSummary(data, months),
      before: periodSummary(data, prev),
      view: buildView(chart, { data, months, prev, range, today, money, periodText, noBase }),
    }
  }, [rawP, rawM, rawG, now, today, data, range, money])

  const update = (next: { p?: ReportPeriod; m?: YearMonth; g?: ChartKind; ver?: boolean }) => {
    const p = new URLSearchParams(params)
    const k = next.p ?? kind
    const m = next.m ?? anchor
    const g = next.g ?? chart
    const t = next.ver ?? asTable
    if (k === 'mes') p.delete('p')
    else p.set('p', k)
    // âncora padrão (mês de hoje) sai da URL
    if (clampAnchor(k, m, range) === clampAnchor(k, now, range)) p.delete('m')
    else p.set('m', m)
    if (g === 'fluxo') p.delete('g')
    else p.set('g', g)
    if (t) p.set('ver', 'tabela')
    else p.delete('ver')
    setParams(p, { replace: true })
  }

  const isCurrent = anchor === clampAnchor(kind, now, range)
  const lastIn = months.includes(range.last)

  return (
    <div>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <PeriodNav
            title={periodText}
            prev={stepAnchor(kind, anchor, -1, range)}
            next={stepAnchor(kind, anchor, 1, range)}
            isCurrent={isCurrent}
            onAnchor={(m) => update({ m })}
            onToday={() => update({ m: now })}
          />
        </div>
        <Segmented
          id="rel-periodo"
          label="Período"
          value={kind}
          onChange={(p) => update({ p })}
          options={REPORT_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
          className="sm:max-w-md"
        />
        <Metrics summary={summary} before={before} prevText={prevText} noBase={prevOutside} />
      </header>

      <Card className="mt-6">
        <Tabs
          baseId="rel-graf"
          label="Gráfico"
          value={chart}
          onChange={(g) => update({ g })}
          items={available.map((k) => ({ value: k, label: CHART_LABEL[k] }))}
          className="overflow-x-auto px-2 [scrollbar-width:none] [&>button]:shrink-0 [&>button]:whitespace-nowrap"
        />
        <TabPanel baseId="rel-graf" value={chart} className="px-4 pt-4 pb-5 sm:px-5">
          <ChartBlock
            key={chart + kind + anchor}
            view={view}
            asTable={asTable}
            onTable={(ver) => update({ ver })}
            // "ir para" só quando o período inteiro está vazio (não só este gráfico)
            jump={!lastIn && view.spec === null && summary.income + summary.spending < EPS ? range.last : undefined}
            onJump={(m) => update({ m })}
          />
        </TabPanel>
      </Card>

      {view.rank.rows.length > 0 && <RankList key={chart + kind + anchor} rank={view.rank} />}
    </div>
  )
}

function PeriodNav({
  title,
  prev,
  next,
  isCurrent,
  onAnchor,
  onToday,
}: {
  title: string
  prev: YearMonth | null
  next: YearMonth | null
  isCurrent: boolean
  onAnchor: (m: YearMonth) => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Período anterior" disabled={!prev} onClick={() => prev && onAnchor(prev)}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <p aria-live="polite" className="num min-w-36 text-center text-sm font-medium first-letter:uppercase">
        {title}
      </p>
      <Button variant="ghost" size="icon" aria-label="Próximo período" disabled={!next} onClick={() => next && onAnchor(next)}>
        <ChevronRight aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={cn('ml-1', isCurrent && 'invisible')}
        aria-hidden={isCurrent || undefined}
        tabIndex={isCurrent ? -1 : undefined}
        onClick={onToday}
      >
        Atual
      </Button>
    </div>
  )
}

/** Três medidas: Entradas / Gastos / Saldo do período, com a variação em texto discreto. */
function Metrics({
  summary,
  before,
  prevText,
  noBase,
}: {
  summary: { income: number; spending: number; net: number }
  before: { income: number; spending: number; net: number }
  prevText: string
  noBase: boolean
}) {
  const { money } = useAppData()
  const rel = (cur: number, old: number) => {
    if (noBase) return 'sem período anterior'
    const p = pctChange(cur, old)
    if (p === null) return cur > EPS ? `nada em ${prevText}` : 'sem movimento'
    return `${pctText(p)} vs ${prevText}`
  }
  const abs = (cur: number, old: number) => {
    if (noBase) return 'sem período anterior'
    const d = cur - old
    if (Math.abs(d) < EPS) return `igual a ${prevText}`
    return `${money(Math.abs(d))} ${d > 0 ? 'a mais' : 'a menos'} que ${prevText}`
  }
  const net = summary.net
  const items = [
    { label: 'Entradas', value: summary.income, delta: rel(summary.income, before.income), tone: undefined },
    { label: 'Gastos', value: summary.spending, delta: rel(summary.spending, before.spending), tone: undefined },
    { label: 'Saldo do período', value: net, delta: abs(net, before.net), tone: net > EPS ? 'text-pos' : net < -EPS ? 'text-neg' : undefined },
  ]
  // celular: uma medida por linha (valor à direita); a partir de 640px, três colunas
  return (
    <dl className="grid divide-y divide-border rounded-lg border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((it) => (
        <div key={it.label} className="grid min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-3 px-4 py-2.5 sm:block sm:px-5 sm:py-4">
          <dt className="truncate text-xs text-fg-muted">{it.label}</dt>
          <dd className={cn('num row-span-2 truncate text-right text-base font-semibold tracking-tight sm:mt-1 sm:text-left sm:text-lg', it.tone)}>
            {money(it.value)}
          </dd>
          <dd className="num truncate text-xs text-fg-subtle sm:mt-0.5" title={it.delta}>
            {it.delta}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ChartBlock({
  view,
  asTable,
  onTable,
  jump,
  onJump,
}: {
  view: ChartView
  asTable: boolean
  onTable: (v: boolean) => void
  jump?: YearMonth
  onJump: (m: YearMonth) => void
}) {
  const { money } = useAppData()
  const titleId = useId()
  const height = view.spec?.type === 'bars' ? Math.max(160, view.spec.rows.length * 34 + 32) : undefined

  return (
    <section aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-medium">
            {view.title}
          </h2>
          {view.sub && <p className="num mt-0.5 text-xs text-fg-subtle">{view.sub}</p>}
        </div>
        {view.spec && (
          <Button variant="outline" size="sm" aria-pressed={asTable} onClick={() => onTable(!asTable)}>
            {asTable ? <ChartColumn aria-hidden="true" /> : <Table2 aria-hidden="true" />}
            {asTable ? 'Ver gráfico' : 'Ver tabela'}
          </Button>
        )}
      </div>

      {!view.spec ? (
        <div className="mt-4 flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium">{view.empty}</p>
          {jump ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => onJump(jump)}>
              Ir para {monthTitle(jump)}
            </Button>
          ) : (
            <p className="mt-1 text-sm text-fg-muted">Troque o período ou escolha outro gráfico.</p>
          )}
        </div>
      ) : asTable ? (
        <DataTable view={view} />
      ) : (
        <>
          {view.legend.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs" aria-label="Legenda">
              {view.legend.map(({ series, total }) => (
                <li key={series.key} className="flex items-center gap-1.5 text-fg-muted">
                  <i aria-hidden="true" className="inline-block size-2.5 rounded-[2px]" style={{ background: TONE_VAR[series.tone] }} />
                  {series.name}
                  <span className="num font-medium text-fg">{money(total)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <ErrorBoundary fallback={<ChartError onTable={() => onTable(true)} />}>
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <ReportChart
                  spec={view.spec}
                  label={view.ariaLabel + ' Use "Ver tabela" para os valores.'}
                  className={height ? undefined : 'h-56 sm:h-64'}
                  style={height ? { height } : undefined}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
          {view.dimmed && <p className="mt-2 text-xs text-fg-subtle">Meses antes do período aparecem esmaecidos, para comparar.</p>}
        </>
      )}
    </section>
  )
}

function ChartError({ onTable }: { onTable: () => void }) {
  return (
    <div role="alert" className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed border-border px-6 py-10 text-center">
      <CircleAlert aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-2 text-sm font-medium">Não foi possível desenhar o gráfico</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onTable}>
        Ver em tabela
      </Button>
    </div>
  )
}

function DataTable({ view }: { view: ChartView }) {
  const { money } = useAppData()
  const { head, rows } = view.table
  return (
    <div className="mt-4 max-h-[520px] overflow-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">{view.title} — tabela</caption>
        <thead className="sticky top-0 bg-surface-2 text-xs text-fg-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn('px-3 py-2 font-medium', i === 0 ? 'text-left' : 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cn('border-t border-border', r.muted && 'text-fg-subtle')}>
              <th scope="row" className="px-3 py-2 text-left font-normal first-letter:uppercase">
                {r.label}
                {r.muted && <span className="sr-only"> (fora do período)</span>}
              </th>
              {r.cells.map((v, i) => (
                <td key={i} className="num px-3 py-2 text-right whitespace-nowrap">
                  {money(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Lista ordenada do gráfico escolhido: no máximo 8 linhas, "ver todas" abre o resto. */
function RankList({ rank }: { rank: ChartView['rank'] }) {
  const { money } = useAppData()
  const [all, setAll] = useState(false)
  const listId = useId()
  const titleId = useId()
  const rows = all ? rank.rows : rank.rows.slice(0, MAX_ROWS)
  const hidden = rank.rows.length - MAX_ROWS
  return (
    <Card className="mt-4" aria-labelledby={titleId}>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2 sm:px-5">
        <h2 id={titleId} className="text-sm font-medium">
          {rank.title}
        </h2>
        <span className="num text-xs text-fg-subtle">
          {rank.rows.length} {rank.rows.length === 1 ? rank.noun[0] : rank.noun[1]}
        </span>
      </div>
      <ol id={listId} className="pb-1">
        {rows.map((r, i) => (
          <RankItem key={r.key} row={r} pos={i + 1} money={money} />
        ))}
      </ol>
      {hidden > 0 && (
        <div className="border-t border-border px-4 py-2 sm:px-5">
          <Button variant="link" size="sm" aria-expanded={all} aria-controls={listId} onClick={() => setAll(!all)}>
            {all ? 'Mostrar menos' : `Ver todas (${rank.rows.length})`}
          </Button>
        </div>
      )}
    </Card>
  )
}

function RankItem({ row, pos, money }: { row: RankRow; pos: number; money: (v: number) => string }) {
  const tone = row.signed ? (row.value > EPS ? 'text-pos' : row.value < -EPS ? 'text-neg' : undefined) : undefined
  const value = row.signed && row.value > EPS ? '+' + money(row.value) : money(row.value)
  const body = (
    <>
      <span aria-hidden="true" className="num w-5 shrink-0 text-xs text-fg-subtle">
        {pos}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{row.name}</span>
        {row.sub && <span className="num block text-xs text-fg-subtle sm:truncate">{row.sub}</span>}
      </span>
      <span className={cn('num shrink-0 text-sm font-medium', tone)}>{value}</span>
    </>
  )
  const cls = 'flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0 sm:px-5'
  return (
    <li>
      {row.href ? (
        <Link to={row.href} className={cn(cls, 'transition-colors hover:bg-surface-2')}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}

function NoData() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <ChartColumn aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-base font-medium">Nada para mostrar ainda</p>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        Os relatórios aparecem quando houver lançamentos nas carteiras, contas fixas pagas, compras no cartão ou pagamentos de empréstimos no BarnaBank atual.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-5">
        <Link to="/">Voltar ao Início</Link>
      </Button>
    </div>
  )
}

function RelatoriosSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="mt-4 h-9 w-full sm:max-w-md" />
      <Skeleton className="mt-4 h-[150px] w-full rounded-lg sm:h-[92px]" />
      <Skeleton className="mt-6 h-[380px] w-full rounded-lg" />
    </div>
  )
}
