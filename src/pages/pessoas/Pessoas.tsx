import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Medal, Plus, Trophy, UserRound } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { rankingHtml, rankingRows } from '@/lib/print/documents'
import { openPrintWindow } from '@/lib/print/html'
import { useDocCtx } from '@/lib/print/use-doc-ctx'
import { buildPersonRows, peopleTotals, PEOPLE_FILTERS, type PeopleFilter, type PeopleTotals } from '@/lib/finance/people'
import { makeDebtCalc } from '@/lib/finance/debts'
import { plural } from '@/lib/format'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import type { AppData } from '@/lib/types'
import { PeopleList } from './PeopleList'
import { PEOPLE_SIDES, type PeopleSide } from './people-sides'
import { PersonDetailView } from './PersonDetail'
import { ClaimsPanel } from './claims-panel'
import { GroupsSection } from './groups/GroupsSection'
import { DebtFormDialog } from './dialogs'
import { BoardDialog } from './dialogs-extra'
import { PEOPLE_SORTS, type PeopleSort } from '@/lib/finance/person-extra'

// Pessoas: lista primeiro. No PC (≥1024px) a pessoa abre num painel ao lado;
// no celular /pessoas/:id é uma página inteira. Filtro e busca ficam na URL (?f=&q=),
// então voltar do detalhe mantém a lista como estava.

const ease = [0.2, 0, 0, 1] as const

export function Pessoas() {
  const { status, result, today } = useAppData()
  if (status === 'loading' || !result) return <PessoasSkeleton />
  return <PessoasReady data={result.data} today={today} />
}

function PessoasReady({ data, today }: { data: AppData; today: string }) {
  const { id } = useParams()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [params, setParams] = useSearchParams()
  const { canCreate } = useAppData()
  const [creating, setCreating] = useState(false)
  const [board, setBoard] = useState(false)
  const toast = useToast()
  const doc = useDocCtx()
  const rawF = params.get('f') as PeopleFilter | null
  const filter: PeopleFilter = rawF && PEOPLE_FILTERS.includes(rawF) ? rawF : 'abertos'
  const query = params.get('q') ?? ''
  const rawL = params.get('l') as PeopleSide | null
  const side: PeopleSide = rawL && PEOPLE_SIDES.includes(rawL) ? rawL : 'todos'
  const rawO = params.get('o') as PeopleSort | null
  const sort: PeopleSort = rawO && PEOPLE_SORTS.includes(rawO) ? rawO : 'due'

  const view = useMemo(() => {
    const calc = makeDebtCalc(today)
    return { calc, rows: buildPersonRows(data, today, calc), totals: peopleTotals(data, today) }
  }, [data, today])

  const update = (next: { f?: PeopleFilter; q?: string; o?: PeopleSort; l?: PeopleSide }) => {
    const p = new URLSearchParams(params)
    const f = next.f ?? filter
    const q = next.q ?? query
    const o = next.o ?? sort
    const l = next.l ?? side
    if (l === 'todos') p.delete('l')
    else p.set('l', l)
    if (f === 'abertos') p.delete('f')
    else p.set('f', f)
    if (q) p.set('q', q)
    else p.delete('q')
    if (o === 'due') p.delete('o')
    else p.set('o', o)
    setParams(p, { replace: true })
  }
  const qs = params.toString()
  const listHref = '/pessoas' + (qs ? '?' + qs : '')

  // celular com pessoa aberta: só o detalhe
  if (id && !wide) {
    return <PersonDetailView key={id} personKey={id} data={data} calc={view.calc} backHref={listHref} fullPage />
  }

  const hasPeople = view.rows.length > 0

  return (
    <div>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Pessoas</h1>
            {hasPeople && (
              <p className="num text-sm text-fg-muted">
                {plural(view.rows.length, 'pessoa', 'pessoas')}
                {view.totals.toPay > 0.005 && <MoneyNote label="eu devo" value={view.totals.toPay} />}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data.debts.some((d) => d.kind === 'receivable') && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const html = rankingHtml(rankingRows(data.debts, today), { ...doc, issuedAt: new Date() })
                  if (!openPrintWindow(html)) toast.show('Seu navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.')
                }}
              >
                <Trophy aria-hidden="true" />
                Ranking
              </Button>
            )}
            {data.debts.some((d) => d.kind === 'receivable') && (
              <Button size="sm" variant="outline" onClick={() => setBoard(true)}>
                <Medal aria-hidden="true" />
                Placar
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" />
                Nova dívida
              </Button>
            )}
          </div>
        </div>
        {hasPeople && <Metrics totals={view.totals} />}
      </header>

      <div className="mt-6 flex flex-col gap-4 empty:hidden">
        <ClaimsPanel />
        <GroupsSection filter={filter} query={query} />
      </div>

      <div className={cn('mt-6', hasPeople && 'lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-8')}>
        <PeopleList
          rows={view.rows}
          side={side}
          onSide={(l) => update({ l })}
          filter={filter}
          query={query}
          onFilter={(f) => update({ f })}
          onQuery={(q) => update({ q })}
          sort={sort}
          onSort={(o) => update({ o })}
          selectedKey={wide ? id : undefined}
          search={qs}
        />
        {hasPeople && wide && (
          <aside aria-label="Pessoa selecionada" className="lg:sticky lg:top-20">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={id ?? 'none'}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.18, ease }}
              >
                {id ? (
                  <PersonDetailView personKey={id} data={data} calc={view.calc} backHref={listHref} />
                ) : (
                  <PickHint />
                )}
              </motion.div>
            </AnimatePresence>
          </aside>
        )}
      </div>
      <DebtFormDialog open={creating} onClose={() => setCreating(false)} />
      <BoardDialog open={board} onClose={() => setBoard(false)} />
    </div>
  )
}

function MoneyNote({ label, value }: { label: string; value: number }) {
  const { money } = useAppData()
  return (
    <>
      <span className="text-fg-subtle"> · </span>
      {label} <span className="font-medium text-fg">{money(value)}</span>
    </>
  )
}

/** As três medidas da tela. Mesmos números do Início (A receber / atrasado). */
function Metrics({ totals }: { totals: PeopleTotals }) {
  const { money } = useAppData()
  const items = [
    { label: 'A receber', value: totals.toReceive, tone: undefined },
    { label: 'Em atraso', value: totals.late, tone: totals.late > 0.005 ? 'text-neg' : undefined },
    { label: 'Recebido', value: totals.received, tone: undefined },
  ]
  return (
    <dl className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
          <dt className="text-xs text-fg-muted">{it.label}</dt>
          <dd className={cn('num mt-1 truncate text-base font-semibold tracking-tight sm:text-lg', it.tone)} title={money(it.value)}>
            {money(it.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function PickHint() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <UserRound aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-sm font-medium">Escolha alguém na lista</p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">A pessoa abre aqui, com as dívidas, as parcelas, o histórico e o calendário.</p>
    </div>
  )
}

function PessoasSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mt-4 h-[74px] w-full rounded-lg" />
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-8">
        <div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="mt-3 h-9 w-full" />
          <div className="mt-4 rounded-lg border border-border bg-surface">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-1.5 h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="hidden h-96 rounded-lg lg:block" />
      </div>
    </div>
  )
}
