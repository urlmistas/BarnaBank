import { useId, useMemo, useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Search, SearchX, Users, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { filterCounts, filterPeople, personStatus, type PeopleFilter, type PersonRow } from '@/lib/finance/people'
import { Select } from '@/components/ui/select'
import { PEOPLE_SORTS, SORT_LABEL, sortPeople, type PeopleSort } from '@/lib/finance/person-extra'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar, SignedMoney } from './parts'
import { personHref } from './links'

const FILTER_LABEL: Record<PeopleFilter, string> = {
  abertos: 'Em aberto',
  atrasados: 'Em atraso',
  quitados: 'Quitados',
  todos: 'Todos',
}

/** complemento das frases ("… em atraso", "… entre os quitados") */
const FILTER_IN: Record<PeopleFilter, string> = {
  abertos: ' em aberto',
  atrasados: ' em atraso',
  quitados: ' entre os quitados',
  todos: '',
}

export type PeopleSide = 'todos' | 'receber' | 'pagar'
export const PEOPLE_SIDES: PeopleSide[] = ['todos', 'receber', 'pagar']
const SIDE_LABEL: Record<PeopleSide, string> = { todos: 'Todos', receber: 'Me devem', pagar: 'Eu devo' }

/** só quem tem dívida daquele lado; o valor passa a ser só daquele lado (não o saldo dos dois) */
export function rowsOfSide(rows: PersonRow[], side: PeopleSide): PersonRow[] {
  if (side === 'todos') return rows
  const kind = side === 'receber' ? 'receivable' : 'payable'
  return rows.filter((r) => r.debts.some((d) => d.kind === kind)).map((r) => ({ ...r, net: side === 'receber' ? r.toReceive : -r.toPay }))
}

export function PeopleList({
  rows: allRows,
  side = 'todos',
  onSide,
  filter,
  query,
  onFilter,
  onQuery,
  sort = 'due',
  onSort,
  selectedKey,
  search,
}: {
  rows: PersonRow[]
  side?: PeopleSide
  onSide?: (s: PeopleSide) => void
  filter: PeopleFilter
  query: string
  onFilter: (f: PeopleFilter) => void
  onQuery: (q: string) => void
  sort?: PeopleSort
  onSort?: (o: PeopleSort) => void
  selectedKey?: string
  search: string
}) {
  const searchId = useId()
  const rows = useMemo(() => rowsOfSide(allRows, side), [allRows, side])
  const sideCounts = useMemo(
    () => ({ todos: allRows.length, receber: rowsOfSide(allRows, 'receber').length, pagar: rowsOfSide(allRows, 'pagar').length }),
    [allRows],
  )
  const listRef = useRef<HTMLUListElement>(null)
  const shown = useMemo(() => sortPeople(filterPeople(rows, filter, query), sort), [rows, filter, query, sort])
  const sortId = useId()
  const counts = useMemo(() => filterCounts(rows, query), [rows, query])

  if (!allRows.length) return <NoPeople />

  // setas ↑/↓ andam entre as linhas
  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-row]') ?? [])
    const i = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (i < 0) return
    e.preventDefault()
    links[Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  return (
    <section aria-label="Lista de pessoas" className="min-w-0">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Buscar pessoa
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && query && onQuery('')}
            placeholder="Buscar pessoa ou assunto"
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
        {onSide && (
          <Segmented
            id="pessoas-lado"
            label="Quem deve a quem"
            value={side}
            onChange={onSide}
            options={PEOPLE_SIDES.map((v) => ({ value: v, label: SIDE_LABEL[v], count: sideCounts[v] }))}
          />
        )}
        <Segmented
          id="pessoas-filtro"
          label="Filtrar pessoas"
          value={filter}
          onChange={onFilter}
          options={(Object.keys(FILTER_LABEL) as PeopleFilter[]).map((f) => ({
            value: f,
            label: FILTER_LABEL[f],
            count: f === 'atrasados' || f === 'quitados' ? counts[f] : undefined,
          }))}
        />
        {onSort && (
          <div className="flex items-center gap-2">
            <label htmlFor={sortId} className="shrink-0 text-xs text-fg-muted">
              Ordenar por
            </label>
            <Select
              id={sortId}
              value={sort}
              onChange={onSort}
              options={PEOPLE_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))}
              className="sm:w-48"
            />
          </div>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {plural(shown.length, 'pessoa', 'pessoas')}
        {FILTER_IN[filter]}
        {query && ` para "${query}"`}
      </p>

      {shown.length === 0 ? (
        <NoResults filter={filter} query={query} counts={counts} onFilter={onFilter} onQuery={onQuery} />
      ) : (
        <ul ref={listRef} onKeyDown={onListKey} aria-label="Pessoas" className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
          <AnimatePresence initial={false}>
            {shown.map((r) => (
              <motion.li
                key={r.key}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                className="border-b border-border last:border-b-0"
              >
                <PersonRowLink row={r} filter={filter} selected={selectedKey === r.key} href={personHref(r.key, search)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}

function PersonRowLink({ row, filter, selected, href }: { row: PersonRow; filter: PeopleFilter; selected: boolean; href: string }) {
  const { money, date, today } = useAppData()
  const st = personStatus(row, today)
  // em "Quitados" (ou sem nada em aberto) o valor é o que já foi quitado, em tom neutro
  const settledView = filter === 'quitados' || row.openCount === 0
  const amount = settledView ? row.settledNet : row.net

  let sub: string
  let late = false
  if (filter === 'quitados') {
    sub =
      plural(row.paidDebts, 'quitada', 'quitadas') +
      (row.lastPaymentISO ? ` · última em ${date(row.lastPaymentISO)}` : '') +
      (row.openCount ? ` · ${row.openCount} em aberto` : '')
  } else if (st.kind === 'late') {
    late = true
    sub = `${st.installments} em atraso · há ${plural(st.days, 'dia', 'dias')}`
  } else if (st.kind === 'open') {
    const when =
      st.dueInDays === 0 ? 'vence hoje' : st.dueInDays === 1 ? 'vence amanhã' : st.nextDueISO ? `vence ${date(st.nextDueISO)}` : ''
    sub = (st.openCount > 1 ? `${st.openCount} dívidas · ` : '') + 'em dia' + (when ? ' · ' + when : '')
  } else sub = 'quitado'

  const dirLabel = settledView ? 'quitado' : amount > 0 ? 'a receber' : amount < 0 ? 'eu devo' : 'saldo zerado'

  return (
    <Link
      to={href}
      data-row
      aria-current={selected ? 'page' : undefined}
      aria-label={`${row.name}, ${sub}, ${dirLabel} ${money(Math.abs(amount))}`}
      className={cn(
        'relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-offset-[-2px]',
        selected && 'bg-surface-2',
      )}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <Avatar name={row.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.name}</span>
        <span className={cn('block truncate text-xs', late ? 'text-neg' : 'text-fg-subtle')}>{sub}</span>
      </span>
      <SignedMoney value={amount} muted={settledView} className="text-sm" />
    </Link>
  )
}

function NoPeople() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <Users aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-base font-medium">Ninguém por aqui ainda</p>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        Quando houver empréstimos ou dívidas no BarnaBank, cada pessoa aparece nesta lista com o que falta receber ou pagar.
      </p>
    </div>
  )
}

function NoResults({
  filter,
  query,
  counts,
  onFilter,
  onQuery,
}: {
  filter: PeopleFilter
  query: string
  counts: Record<PeopleFilter, number>
  onFilter: (f: PeopleFilter) => void
  onQuery: (q: string) => void
}) {
  const q = query.trim()
  const elsewhere = filter !== 'todos' && counts.todos > 0
  const msg = q
    ? `Nada encontrado para "${q}"${FILTER_IN[filter]}.`
    : filter === 'atrasados'
      ? 'Ninguém em atraso.'
      : filter === 'quitados'
        ? 'Nada quitado ainda.'
        : 'Tudo quitado. Ninguém com dívida em aberto.'
  return (
    <div className="mt-4 flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <SearchX aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-sm text-fg-muted">{msg}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {elsewhere && (
          <Button variant="outline" size="sm" onClick={() => onFilter('todos')}>
            Ver em Todos ({counts.todos})
          </Button>
        )}
        {q && (
          <Button variant="ghost" size="sm" onClick={() => onQuery('')}>
            Limpar busca
          </Button>
        )}
      </div>
    </div>
  )
}
