import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Inbox, Receipt, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { TabPanel, Tabs } from '@/components/ui/tabs'
import { billDetail, cardDetail, parseRouteId, type BillDetail, type CardDetail, type ContaRow } from '@/lib/finance/contas'
import { stepMonth } from '@/lib/finance/wallets'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppData, YearMonth } from '@/lib/types'
import { walletHref } from '@/pages/carteiras/links'
import { StatusBadge } from './ContasList'
import { BillActions, CardActions, DeletePurchaseButton } from './ContaActions'
import { dueText, monthName, monthShort, monthTitle, statusText } from './text'

const ease = [0.2, 0, 0, 1] as const

type Range = { min: YearMonth; max: YearMonth }

export function ContaDetailView({
  routeId,
  data,
  month,
  range,
  backHref,
  fullPage = false,
  onMonth,
}: {
  routeId: string
  data: AppData
  month: YearMonth
  range: Range
  backHref: string
  fullPage?: boolean
  onMonth: (m: YearMonth) => void
}) {
  const { today } = useAppData()
  const ref = parseRouteId(routeId)
  const kind = ref?.kind
  const refId = ref?.refId ?? ''
  const bill = useMemo(() => (kind === 'fixa' ? billDetail(data, refId, month, today) : null), [kind, refId, data, month, today])
  const card = useMemo(() => (kind === 'fatura' ? cardDetail(data, refId, month, today) : null), [kind, refId, data, month, today])
  const headingRef = useRef<HTMLHeadingElement>(null)

  // página inteira (celular): o foco vai para o nome, como numa navegação nova
  useEffect(() => {
    if (fullPage) headingRef.current?.focus()
  }, [fullPage])

  if (!bill && !card) return <NotFound backHref={backHref} fullPage={fullPage} />

  const H = fullPage ? 'h1' : 'h2'
  const name = bill ? bill.bill.name : card!.card.name
  const sub = bill
    ? [bill.bill.kind === 'entrada' ? 'Receita fixa' : 'Conta fixa', bill.bill.category].filter(Boolean).join(' · ')
    : `Cartão de crédito · fecha dia ${card!.card.closingDay} · vence dia ${card!.card.dueDay}`

  return (
    <motion.article
      aria-labelledby="conta-nome"
      initial={fullPage ? { opacity: 0, x: 12 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease }}
      className={cn(!fullPage && 'rounded-lg border border-border bg-surface')}
    >
      {fullPage && (
        <Button asChild variant="ghost" size="sm" className="-ml-2.5 mb-4">
          <Link to={backHref}>
            <ArrowLeft aria-hidden="true" /> Contas
          </Link>
        </Button>
      )}
      <header className={cn('flex items-start gap-3', !fullPage && 'px-5 pt-5')}>
        <div className="min-w-0 flex-1">
          <H id="conta-nome" ref={headingRef} tabIndex={-1} className="truncate text-lg font-semibold tracking-tight outline-none">
            {card ? `Fatura ${name}` : name}
          </H>
          <p className="text-sm text-fg-muted">{sub}</p>
        </div>
        {!fullPage && (
          <Button asChild variant="ghost" size="icon" className="-mt-1 -mr-2">
            <Link to={backHref} aria-label="Fechar conta" title="Fechar">
              <X aria-hidden="true" />
            </Link>
          </Button>
        )}
      </header>

      {bill ? (
        <BillBody d={bill} data={data} month={month} padded={!fullPage} onMonth={onMonth} />
      ) : (
        <CardBody d={card!} data={data} month={month} range={range} padded={!fullPage} onMonth={onMonth} />
      )}
    </motion.article>
  )
}

// ---------------------------------------------------------------- peças

function WalletLink({ data, walletId, label }: { data: AppData; walletId?: string; label: string }) {
  const w = walletId ? data.wallets.find((x) => x.id === walletId) : undefined
  if (!w) return null
  return (
    <Link
      to={walletHref(w.id, '')}
      className="inline-flex items-center gap-1 rounded-sm text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
    >
      {label} <span className="font-medium text-fg">{w.name}</span>
      <ArrowUpRight aria-hidden="true" className="size-3.5" />
    </Link>
  )
}

function Facts({ items }: { items: { label: string; value: ReactNode; tone?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="truncate text-xs text-fg-muted">{it.label}</dt>
          <dd className={cn('num mt-0.5 truncate text-sm font-medium', it.tone)}>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** valor do mês em destaque, com o status ao lado */
function MonthFigure({ label, row, extra }: { label: string; row: ContaRow; extra?: ReactNode }) {
  const { money, date } = useAppData()
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-xs text-fg-muted first-letter:uppercase">{label}</p>
        <StatusBadge row={row} />
        <span className="sr-only">{statusText(row)}</span>
      </div>
      <p className={cn('num mt-0.5 text-2xl font-semibold tracking-tight', row.income && row.status !== 'paga' && 'text-pos')}>
        {row.income ? '+' : ''}
        {money(row.amount)}
      </p>
      <p className={cn('text-sm', row.status === 'atrasada' ? 'text-neg' : 'text-fg-muted')}>
        {dueText(row, date)}
        {extra}
      </p>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">{children}</p>
}

// ---------------------------------------------------------------- conta fixa

function BillBody({
  d,
  data,
  month,
  padded,
  onMonth,
}: {
  d: BillDetail
  data: AppData
  month: YearMonth
  padded: boolean
  onMonth: (m: YearMonth) => void
}) {
  const { money } = useAppData()
  const b = d.bill
  const cur = d.months.find((m) => m.key === month)
  const isIn = b.kind === 'entrada'
  const recurrence = [
    { label: 'Repete', value: `todo dia ${b.dueDay}` },
    { label: 'Valor cadastrado', value: money(b.amount) },
    { label: 'Desde', value: b.startMonth ? monthShort(b.startMonth) : '—' },
    { label: 'Até', value: b.endMonth ? monthShort(b.endMonth) : 'sem fim' },
    { label: 'Situação', value: b.active === false ? 'inativa' : 'ativa' },
  ]
  const applicable = d.months.length
  return (
    <div className={cn('mt-4 flex flex-col gap-5', padded && 'px-5 pb-5')}>
      {cur ? (
        <MonthFigure label={monthTitle(month)} row={cur.row} />
      ) : (
        <Note>
          Esta conta não vale em {monthTitle(month)}
          {b.active === false ? ' (está inativa no BarnaBank).' : '.'}
        </Note>
      )}

      <WalletLink data={data} walletId={cur?.row.walletId ?? b.walletId} label={cur?.row.status === 'paga' ? (isIn ? 'Recebida em' : 'Paga com') : 'Carteira padrão'} />

      <BillActions bill={b} month={month} status={cur ? cur.row.status : null} padded={false} />

      <section aria-labelledby="conta-recorrencia">
        <h3 id="conta-recorrencia" className="mb-2 text-sm font-medium">
          Recorrência
        </h3>
        <Facts items={recurrence} />
      </section>

      <section aria-labelledby="conta-historico">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 id="conta-historico" className="text-sm font-medium">
            Histórico
          </h3>
          <p className="num text-xs text-fg-muted">
            {d.paidCount} de {plural(applicable, 'mês', 'meses')} {isIn ? 'recebidos' : 'pagos'}
            {d.paidTotal > 0.005 && <> · {money(d.paidTotal)}</>}
          </p>
        </div>
        {applicable === 0 ? (
          <Empty>Nenhum mês para mostrar.</Empty>
        ) : (
          <ul className="rounded-md border border-border">
            {d.months.map((m) => (
              <HistoryRow key={m.key} ym={m.key} row={m.row} selected={m.key === month} onSelect={() => onMonth(m.key)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function HistoryRow({ ym, row, selected, onSelect }: { ym: YearMonth; row: ContaRow; selected: boolean; onSelect: () => void }) {
  const { money, date } = useAppData()
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${monthTitle(ym)}: ${statusText(row)}, ${dueText(row, date)}, ${money(row.amount)}`}
        className={cn(
          'relative flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-offset-[-2px]',
          selected && 'bg-surface-2',
        )}
      >
        {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm first-letter:uppercase">{monthTitle(ym)}</span>
          <span className={cn('block truncate text-xs', row.status === 'atrasada' ? 'text-neg' : 'text-fg-subtle')}>{dueText(row, date)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <StatusBadge row={row} />
          <span className={cn('num w-24 text-right text-sm font-medium', row.status === 'paga' || row.status === 'vazia' ? 'text-fg-muted' : 'text-fg')}>
            {money(row.amount)}
          </span>
        </span>
      </button>
    </li>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
      <Inbox aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- fatura

type CardTab = 'compras' | 'faturas'

function CardBody({
  d,
  data,
  month,
  range,
  padded,
  onMonth,
}: {
  d: CardDetail
  data: AppData
  month: YearMonth
  range: Range
  padded: boolean
  onMonth: (m: YearMonth) => void
}) {
  const { money, date, today } = useAppData()
  const [tab, setTab] = useState<CardTab>('compras')
  const baseId = useId()
  const it = d.invoice
  const balance = it.balance ?? 0
  const carry = it.carry ?? 0
  const prev = stepMonth(month, -1, range)
  const next = stepMonth(month, 1, range)
  const closed = it.close! < today

  return (
    <div className="mt-4">
      <div className={cn('flex flex-col gap-4', padded && 'px-5')}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <MonthFigure label={`Fatura de ${monthName(month)} ${month.slice(0, 4)}`} row={d.row} />
          </div>
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon" aria-label="Fatura anterior" disabled={!prev} onClick={() => prev && onMonth(prev)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Próxima fatura" disabled={!next} onClick={() => next && onMonth(next)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <Facts
          items={[
            { label: closed ? 'Fechou' : 'Fecha', value: date(it.close!) },
            { label: 'Vence', value: date(it.due!), tone: d.row.status === 'atrasada' ? 'text-neg' : undefined },
            { label: 'Compras no mês', value: money(it.charges) },
            { label: 'Pago', value: money(it.paid) },
            balance < -0.005
              ? { label: 'Crédito', value: money(-balance) }
              : { label: 'Falta', value: money(Math.max(0, balance)), tone: balance > 0.005 && d.row.status === 'atrasada' ? 'text-neg' : undefined },
          ]}
        />

        {(carry > 0.005 || carry < -0.005 || (it.rolled ?? 0) > 0.005) && (
          <div className="flex flex-col gap-2">
            {carry > 0.005 && <Note>Inclui {money(carry)} que ficou da fatura anterior (não foi pago até o vencimento).</Note>}
            {carry < -0.005 && <Note>Crédito de {money(-carry)} da fatura anterior, já descontado.</Note>}
            {(it.rolled ?? 0) > 0.005 && <Note>{money(it.rolled!)} não foi pago até o vencimento e passou para a fatura seguinte.</Note>}
          </div>
        )}

        <LimitBox d={d} />

        <WalletLink data={data} walletId={d.card.walletId} label={d.row.status === 'paga' ? 'Paga com' : 'Pagar com'} />

        <CardActions card={d.card} invoiceKey={month} balance={balance} due={it.due!} padded={false} />
      </div>

      <div className="mt-5">
        <Tabs
          baseId={baseId}
          label={`Informações do cartão ${d.card.name}`}
          value={tab}
          onChange={setTab}
          className={cn(padded && 'px-3')}
          items={[
            { value: 'compras', label: 'Compras', count: d.items.length },
            { value: 'faturas', label: 'Faturas', count: d.history.length },
          ]}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease }}>
            <TabPanel baseId={baseId} value={tab} className={cn('pt-4', padded ? 'px-5 pb-5' : 'pb-2')}>
              {tab === 'compras' ? (
                <Purchases d={d} />
              ) : d.history.length === 0 ? (
                <Empty>Nenhuma fatura com compras ainda.</Empty>
              ) : (
                <ul className="rounded-md border border-border">
                  {d.history.map((h) => (
                    <HistoryRow key={h.key} ym={h.key} row={h.row} selected={h.key === month} onSelect={() => onMonth(h.key)} />
                  ))}
                </ul>
              )}
            </TabPanel>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function LimitBox({ d }: { d: CardDetail }) {
  const { money } = useAppData()
  return (
    <section aria-label="Limite do cartão" className="rounded-md border border-border px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fg-muted">Limite usado</span>
        <span className="num text-fg-subtle">{d.usedPct !== null ? `${Math.round(d.usedPct)}%` : 'sem limite cadastrado'}</span>
      </div>
      <p className="num mt-0.5 text-sm font-medium">
        {money(d.used)}
        {d.limit > 0 && <span className="font-normal text-fg-muted"> de {money(d.limit)}</span>}
      </p>
      {d.usedPct !== null && (
        <>
          <div
            role="progressbar"
            aria-label={`Limite usado do cartão ${d.card.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(d.usedPct)}
            className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${d.usedPct}%` }} />
          </div>
          <p className={cn('num mt-1.5 text-xs', d.available < -0.005 ? 'text-neg' : 'text-fg-subtle')}>
            {d.available < -0.005 ? `acima do limite em ${money(-d.available)}` : `disponível ${money(d.available)}`}
          </p>
        </>
      )}
    </section>
  )
}

function Purchases({ d }: { d: CardDetail }) {
  const { money, date } = useAppData()
  const pays = d.invoice.payments
  if (!d.items.length && !pays.length) return <Empty>Nenhuma compra nesta fatura.</Empty>
  return (
    <div className="flex flex-col gap-3">
      {d.items.length > 0 && (
        <ul aria-label="Compras da fatura" className="rounded-md border border-border">
          {d.items.map((x) => (
            <li key={x.key} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{x.label}</span>
                <span className="num block truncate text-xs text-fg-subtle">
                  {[date(x.date), x.n > 1 ? `parcela ${x.i}/${x.n} de ${money(x.purchaseTotal)}` : null, x.category && x.category !== x.label ? x.category : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="num shrink-0 text-sm font-medium whitespace-nowrap">{money(x.value)}</span>
              <DeletePurchaseButton purchaseId={x.key.slice(0, x.key.lastIndexOf(':'))} label={x.label} installments={x.n} />
            </li>
          ))}
        </ul>
      )}
      {pays.length > 0 && (
        <section aria-labelledby="fatura-pagamentos">
          <h4 id="fatura-pagamentos" className="px-1 pb-1.5 text-xs font-medium text-fg-muted">
            Pagamentos
          </h4>
          <ul className="rounded-md border border-border">
            {pays.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">Pagamento</span>
                  <span className="num block text-xs text-fg-subtle">{p.date ? date(p.date) : 'sem data'}</span>
                </span>
                <span className="num shrink-0 text-sm font-medium whitespace-nowrap text-fg-muted">−{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="num flex justify-between px-1 text-xs text-fg-muted">
        <span>Total da fatura</span>
        <span className="font-medium text-fg">{money(d.invoice.total ?? 0)}</span>
      </p>
    </div>
  )
}

function NotFound({ backHref, fullPage }: { backHref: string; fullPage: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Receipt aria-hidden="true" className="size-5 text-fg-subtle" />
      {fullPage ? <h1 className="mt-3 text-base font-medium">Conta não encontrada</h1> : <h2 className="mt-3 text-base font-medium">Conta não encontrada</h2>}
      <p className="mt-1 max-w-xs text-sm text-fg-muted">Ela pode ter sido excluída no BarnaBank, ou o link está incompleto.</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to={backHref}>Voltar para Contas</Link>
      </Button>
    </div>
  )
}
