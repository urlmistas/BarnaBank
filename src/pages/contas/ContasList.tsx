import { useId, useMemo, useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Receipt, Search, SearchX, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { CONTA_FILTERS, contaCounts, filterContas, type ContaFilter, type ContaRow } from '@/lib/finance/contas'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppData, YearMonth } from '@/lib/types'
import { contaHref, dueText, FILTER_IN, FILTER_LABEL, monthTitle, statusText } from './text'

export function ContasList({
  rows,
  data,
  month,
  filter,
  query,
  onFilter,
  onQuery,
  onToday,
  isCurrentMonth,
  selectedId,
  search,
}: {
  rows: ContaRow[]
  data: AppData
  month: YearMonth
  filter: ContaFilter
  query: string
  onFilter: (f: ContaFilter) => void
  onQuery: (q: string) => void
  onToday: () => void
  isCurrentMonth: boolean
  selectedId?: string
  search: string
}) {
  const searchId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const shown = useMemo(() => filterContas(rows, filter, query), [rows, filter, query])
  const counts = useMemo(() => contaCounts(rows, query), [rows, query])
  const walletName = (id?: string) => (id ? data.wallets.find((w) => w.id === id)?.name : undefined)

  // setas ↑/↓ andam entre as linhas
  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-row]') ?? [])
    const i = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (i < 0) return
    e.preventDefault()
    links[Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  const title = monthTitle(month)

  return (
    <section aria-label="Lista de contas" className="min-w-0">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Buscar conta
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && query && onQuery('')}
            placeholder="Buscar conta, cartão ou categoria"
            autoComplete="off"
            className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label="Limpar busca"
              className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-sm text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <Segmented
          id="contas-filtro"
          label="Filtrar contas"
          value={filter}
          onChange={onFilter}
          options={CONTA_FILTERS.map((f) => ({
            value: f,
            label: FILTER_LABEL[f],
            count: f === 'todas' ? undefined : counts[f],
          }))}
        />
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {plural(shown.length, 'conta', 'contas')}
        {FILTER_IN[filter]} em {title}
        {query && ` para "${query}"`}
      </p>

      {shown.length === 0 ? (
        <NoResults
          filter={filter}
          query={query}
          title={title}
          monthEmpty={rows.length === 0}
          counts={counts}
          isCurrentMonth={isCurrentMonth}
          onFilter={onFilter}
          onQuery={onQuery}
          onToday={onToday}
        />
      ) : (
        <ul ref={listRef} onKeyDown={onListKey} aria-label={`Contas de ${title}`} className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
          <AnimatePresence initial={false}>
            {shown.map((r) => (
              <motion.li
                key={r.id}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                className="border-b border-border last:border-b-0"
              >
                <ContaRowLink row={r} selected={selectedId === r.id} href={contaHref(r.id, search)} wallet={walletName(r.walletId)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}

function ContaRowLink({ row, selected, href, wallet }: { row: ContaRow; selected: boolean; href: string; wallet?: string }) {
  const { money, date } = useAppData()
  const late = row.status === 'atrasada'
  const partial = row.kind === 'fatura' && row.open > 0.005 && Math.abs(row.open - row.amount) > 0.005
  const parts = [dueText(row, date)]
  if (partial) parts.push(`falta ${money(row.open)}`)
  if (row.kind === 'fixa' && row.category) parts.push(row.category)
  if (row.kind === 'fatura' && wallet) parts.push(`paga com ${wallet}`)
  const sub = parts.join(' · ')
  const st = statusText(row)
  const kindTxt = row.kind === 'fatura' ? 'fatura do cartão' : row.income ? 'receita fixa' : 'conta fixa'
  const muted = row.status === 'paga' || row.status === 'vazia'
  return (
    <Link
      to={href}
      data-row
      aria-current={selected ? 'page' : undefined}
      aria-label={`${row.name}, ${kindTxt}, ${st}, ${sub}, ${row.income ? 'a receber' : 'valor'} ${money(row.amount)}`}
      className={cn(
        'relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-offset-[-2px]',
        selected && 'bg-surface-2',
      )}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{row.name}</span>
          {row.kind === 'fatura' && <span className="shrink-0 text-xs text-fg-subtle">Fatura</span>}
          {row.income && <span className="shrink-0 text-xs text-fg-subtle">Receita</span>}
        </span>
        <span className={cn('block truncate text-xs', late ? 'text-neg' : 'text-fg-subtle')}>{sub}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            'num text-sm font-medium whitespace-nowrap',
            row.income && !muted ? 'text-pos' : muted ? 'text-fg-muted' : 'text-fg',
          )}
        >
          {row.income ? '+' : ''}
          {money(row.amount)}
        </span>
        <StatusBadge row={row} />
      </span>
    </Link>
  )
}

export function StatusBadge({ row, className }: { row: Pick<ContaRow, 'status' | 'income'>; className?: string }) {
  return (
    <Badge
      aria-hidden="true"
      variant={row.status === 'hoje' ? 'accent' : 'outline'}
      className={cn('py-0 leading-4', row.status === 'atrasada' && 'border-neg/40 text-neg', row.status === 'paga' && 'text-fg-subtle', className)}
    >
      {statusText(row)}
    </Badge>
  )
}

export function NoContas() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <Receipt aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-base font-medium">Nenhuma conta ainda</p>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        Cadastre contas fixas (aluguel, internet, assinaturas) e cartões de crédito no BarnaBank atual. Elas aparecem aqui mês a mês, com vencimento e situação.
      </p>
    </div>
  )
}

function NoResults({
  filter,
  query,
  title,
  monthEmpty,
  counts,
  isCurrentMonth,
  onFilter,
  onQuery,
  onToday,
}: {
  filter: ContaFilter
  query: string
  title: string
  monthEmpty: boolean
  counts: Record<ContaFilter, number>
  isCurrentMonth: boolean
  onFilter: (f: ContaFilter) => void
  onQuery: (q: string) => void
  onToday: () => void
}) {
  const q = query.trim()
  const elsewhere = filter !== 'todas' && counts.todas > 0
  const msg = monthEmpty
    ? `Nenhuma conta vigente em ${title}.`
    : q
      ? `Nada encontrado para "${q}"${FILTER_IN[filter]} em ${title}.`
      : filter === 'atrasadas'
        ? `Nenhuma conta atrasada em ${title}.`
        : filter === 'pagas'
          ? `Nenhuma conta paga em ${title} ainda.`
          : `Tudo pago em ${title}.`
  return (
    <div className="mt-4 flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <SearchX aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-sm text-fg-muted">{msg}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {elsewhere && (
          <Button variant="outline" size="sm" onClick={() => onFilter('todas')}>
            Ver todas ({counts.todas})
          </Button>
        )}
        {q && (
          <Button variant="ghost" size="sm" onClick={() => onQuery('')}>
            Limpar busca
          </Button>
        )}
        {monthEmpty && !isCurrentMonth && (
          <Button variant="outline" size="sm" onClick={onToday}>
            Ir para o mês atual
          </Button>
        )}
      </div>
    </div>
  )
}
