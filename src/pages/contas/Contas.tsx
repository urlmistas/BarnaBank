import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CONTA_FILTERS, contasMonthRange, contasRows, contasTotals, type ContaFilter, type ContasTotals } from '@/lib/finance/contas'
import { clampMonth, stepMonth } from '@/lib/finance/wallets'
import { ymOf } from '@/lib/finance/dates'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import type { AppData, YearMonth } from '@/lib/types'
import { ContasList, NoContas } from './ContasList'
import { ContaDetailView } from './ContaDetail'
import { monthName, monthTitle } from './text'

// Contas: contas fixas e faturas de cartão de um mês. No PC (≥1024px) a conta abre num
// painel ao lado; no celular /contas/:id é uma página inteira (como Pessoas e Carteiras).
// Mês, filtro e busca ficam na URL (?m=AAAA-MM&f=pendentes&q=luz).

const ease = [0.2, 0, 0, 1] as const
const YM_RE = /^\d{4}-\d{2}$/

export function Contas() {
  const { status, result, today } = useAppData()
  if (status === 'loading' || !result) return <ContasSkeleton />
  return <ContasReady data={result.data} today={today} />
}

function ContasReady({ data, today }: { data: AppData; today: string }) {
  const { id } = useParams()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [params, setParams] = useSearchParams()
  const rawF = params.get('f') as ContaFilter | null
  const filter: ContaFilter = rawF && CONTA_FILTERS.includes(rawF) ? rawF : 'todas'
  const query = params.get('q') ?? ''
  const now = ymOf(today)
  const range = useMemo(() => contasMonthRange(data, today), [data, today])
  const rawM = params.get('m')
  const month: YearMonth = clampMonth(rawM && YM_RE.test(rawM) ? rawM : now, range)

  const rows = useMemo(() => contasRows(data, month, today), [data, month, today])
  const totals = useMemo(() => contasTotals(rows), [rows])

  const update = (next: { f?: ContaFilter; q?: string; m?: YearMonth }) => {
    const p = new URLSearchParams(params)
    const f = next.f ?? filter
    const q = next.q ?? query
    const m = next.m ?? month
    if (f === 'todas') p.delete('f')
    else p.set('f', f)
    if (q) p.set('q', q)
    else p.delete('q')
    // mês de hoje sai da URL (é o padrão)
    if (m === now) p.delete('m')
    else p.set('m', m)
    setParams(p, { replace: true })
  }
  const qs = params.toString()
  const listHref = '/contas' + (qs ? '?' + qs : '')

  const detail = (fullPage: boolean) =>
    id ? (
      <ContaDetailView
        key={fullPage ? id : undefined}
        routeId={id}
        data={data}
        month={month}
        range={range}
        backHref={listHref}
        fullPage={fullPage}
        onMonth={(m) => update({ m })}
      />
    ) : null

  // celular com conta aberta: só o detalhe
  if (id && !wide) return detail(true)

  const has = data.bills.length + data.cards.length > 0

  return (
    <div>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          {has && <MonthNav month={month} range={range} isCurrent={month === now} onMonth={(m) => update({ m })} />}
        </div>
        {has && <Metrics totals={totals} month={month} />}
      </header>

      {!has ? (
        <div className="mt-6">
          <NoContas />
        </div>
      ) : (
        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <ContasList
            rows={rows}
            data={data}
            month={month}
            filter={filter}
            query={query}
            onFilter={(f) => update({ f })}
            onQuery={(q) => update({ q })}
            onToday={() => update({ m: now })}
            isCurrentMonth={month === now}
            selectedId={wide ? id : undefined}
            search={qs}
          />
          {wide && (
            <aside aria-label="Conta selecionada" className="lg:sticky lg:top-20">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={id ?? 'none'}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.18, ease }}
                >
                  {id ? detail(false) : <PickHint />}
                </motion.div>
              </AnimatePresence>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function MonthNav({
  month,
  range,
  isCurrent,
  onMonth,
}: {
  month: YearMonth
  range: { min: YearMonth; max: YearMonth }
  isCurrent: boolean
  onMonth: (m: YearMonth) => void
}) {
  const { today } = useAppData()
  const prev = stepMonth(month, -1, range)
  const next = stepMonth(month, 1, range)
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Mês anterior" disabled={!prev} onClick={() => prev && onMonth(prev)}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <p aria-live="polite" className="min-w-36 text-center text-sm font-medium first-letter:uppercase">
        {monthTitle(month)}
      </p>
      <Button variant="ghost" size="icon" aria-label="Próximo mês" disabled={!next} onClick={() => next && onMonth(next)}>
        <ChevronRight aria-hidden="true" />
      </Button>
      {/* espaço reservado: o botão aparece fora do mês atual sem empurrar o resto */}
      <Button
        variant="outline"
        size="sm"
        className={cn('ml-1', isCurrent && 'invisible')}
        aria-hidden={isCurrent || undefined}
        tabIndex={isCurrent ? -1 : undefined}
        onClick={() => onMonth(ymOf(today))}
      >
        Hoje
      </Button>
    </div>
  )
}

/** Três medidas: a pagar (inclui atrasadas), pago e em atraso — só gastos fixos e faturas. */
function Metrics({ totals, month }: { totals: ContasTotals; month: YearMonth }) {
  const { money } = useAppData()
  const items = [
    { label: 'A pagar', more: ` em ${monthName(month)}`, value: totals.toPay, tone: undefined },
    { label: 'Pago', more: '', value: totals.paid, tone: undefined },
    { label: 'Em atraso', more: '', value: totals.late, tone: totals.late > 0.005 ? 'text-neg' : undefined },
  ]
  return (
    <div>
      <dl className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface">
        {items.map((it) => (
          <div key={it.label} className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
            <dt className="truncate text-xs text-fg-muted">
              {it.label}
              {/* no celular o mês já está no seletor acima */}
              {it.more && <span className="hidden sm:inline">{it.more}</span>}
            </dt>
            <dd className={cn('num mt-1 truncate text-base font-semibold tracking-tight sm:text-lg', it.tone)} title={money(it.value)}>
              {money(it.value)}
            </dd>
          </div>
        ))}
      </dl>
      {totals.income > 0.005 && (
        <p className="num mt-2 text-xs text-fg-muted">
          Receitas fixas no mês <span className="font-medium text-fg">{money(totals.income)}</span>
          <span className="text-fg-subtle"> · </span>
          {totals.incomeOpen > 0.005 ? <>falta receber {money(totals.incomeOpen)}</> : 'tudo recebido'}
        </p>
      )}
    </div>
  )
}

function PickHint() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Receipt aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-sm font-medium">Escolha uma conta</p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">
        Conta fixa abre com a recorrência e o histórico de pagamentos; fatura, com as compras, as parcelas e o limite.
      </p>
    </div>
  )
}

function ContasSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="mt-4 h-[74px] w-full rounded-lg" />
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-8">
        <div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="mt-3 h-9 w-full" />
          <div className="mt-4 rounded-lg border border-border bg-surface">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <div>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-1.5 h-3 w-40" />
                </div>
                <div className="flex flex-col items-end">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="mt-1.5 h-4 w-14" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="hidden h-96 rounded-lg lg:block" />
      </div>
    </div>
  )
}
