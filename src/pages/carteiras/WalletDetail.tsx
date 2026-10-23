import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowLeftRight, ChevronLeft, ChevronRight, Inbox, Pencil, Plus, SearchX, Trash2, Wallet, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { TabPanel, Tabs } from '@/components/ui/tabs'
import {
  clampMonth, MOVEMENT_FILTERS, stepMonth, walletCards, walletEvents, walletKindLabel, walletMonth, walletMonthRange,
  type MovementFilter, type WalletCardInfo, type WalletEvent,
} from '@/lib/finance/wallets'
import { ymOf } from '@/lib/finance/dates'
import { MONTHS, plural, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppData, YearMonth } from '@/lib/types'
import { SignedMoney } from '@/pages/pessoas/parts'
import { ConfirmDialog } from '@/pages/pessoas/dialogs'
import { findTxIndex, txIdFromKey } from '@/lib/finance/wallet-mutations'
import { FILTER_LABEL, FILTER_NONE, INV_TXT } from './text'
import { TxFormDialog, WalletFormDialog } from './dialogs'
import { useWalletActions } from './use-wallet-actions'
import { WalletIcon } from './wallet-icon'

const WalletChart = lazy(() => import('./WalletChart').then((m) => ({ default: m.WalletChart })))

const ease = [0.2, 0, 0, 1] as const
type Tab = 'movimentos' | 'saldo'

const monthTitle = (ym: YearMonth) => `${MONTHS[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`

export function WalletDetailView({
  walletId,
  data,
  backHref,
  fullPage = false,
  filter,
  month,
  onFilter,
  onMonth,
}: {
  walletId: string
  data: AppData
  backHref: string
  fullPage?: boolean
  filter: MovementFilter
  month?: YearMonth
  onFilter: (f: MovementFilter) => void
  onMonth: (m: YearMonth | null) => void
}) {
  const { today, money, canEdit } = useAppData()
  const { deleteWallet } = useWalletActions()
  const [dlg, setDlg] = useState<'edit' | 'delete' | 'tx' | null>(null)
  const wallet = data.wallets.find((w) => w.id === walletId)
  const events = useMemo(() => (wallet ? walletEvents(data, wallet.id) : []), [data, wallet])
  const cards = useMemo(() => (wallet ? walletCards(data, wallet.id, today) : []), [data, wallet, today])
  const headingRef = useRef<HTMLHeadingElement>(null)

  // página inteira (celular): o foco vai para o nome, como numa navegação nova
  useEffect(() => {
    if (fullPage) headingRef.current?.focus()
  }, [fullPage])

  if (!wallet) return <NotFound backHref={backHref} fullPage={fullPage} />

  const balance = events.reduce((s, e) => s + (e.kind === 'entrada' ? e.amount : -e.amount), 0)
  const H = fullPage ? 'h1' : 'h2'
  return (
    <motion.article
      aria-labelledby="carteira-nome"
      initial={fullPage ? { opacity: 0, x: 12 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease }}
      className={cn(!fullPage && 'rounded-lg border border-border bg-surface')}
    >
      {fullPage && (
        <Button asChild variant="ghost" size="sm" className="-ml-2.5 mb-4">
          <Link to={backHref}>
            <ArrowLeft aria-hidden="true" /> Carteiras
          </Link>
        </Button>
      )}
      <header className={cn('flex items-start gap-3', !fullPage && 'px-5 pt-5')}>
        <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-border text-fg-muted">
          <WalletIcon icon={wallet.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <H id="carteira-nome" ref={headingRef} tabIndex={-1} className="truncate text-lg font-semibold tracking-tight outline-none">
            {wallet.name}
          </H>
          <p className="text-sm text-fg-muted">
            {walletKindLabel(wallet.icon)} · {events.length ? plural(events.length, 'movimento', 'movimentos') : 'sem movimentos'}
          </p>
        </div>
        {!fullPage && (
          <Button asChild variant="ghost" size="icon" className="-mt-1 -mr-2">
            <Link to={backHref} aria-label="Fechar carteira" title="Fechar">
              <X aria-hidden="true" />
            </Link>
          </Button>
        )}
      </header>

      {canEdit && (
        <div className={cn('mt-4 flex flex-wrap items-center gap-1.5', !fullPage && 'px-5')}>
          <Button size="sm" onClick={() => setDlg('tx')}>
            <Plus aria-hidden="true" />
            Lançamento
          </Button>
          <span className="ml-auto flex gap-0.5">
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar carteira ${wallet.name}`} title="Editar" onClick={() => setDlg('edit')}>
              <Pencil />
            </Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Excluir carteira ${wallet.name}`} title="Excluir" onClick={() => setDlg('delete')}>
              <Trash2 />
            </Button>
          </span>
          <TxFormDialog open={dlg === 'tx'} onClose={() => setDlg(null)} walletId={wallet.id} />
          <WalletFormDialog open={dlg === 'edit'} onClose={() => setDlg(null)} wallet={wallet} />
          <ConfirmDialog
            open={dlg === 'delete'}
            onClose={() => setDlg(null)}
            title="Excluir carteira"
            okLabel="Excluir carteira"
            onOk={() => {
              // sai da carteira excluída: volta para a lista (a rota é um HashRouter)
              if (deleteWallet(wallet)) window.location.hash = '#' + backHref
            }}
          >
            Excluir a carteira <b className="text-fg">{wallet.name}</b>? Os lançamentos dela também serão apagados. Pagamentos de empréstimo continuam
            existindo, só perdem o vínculo com a carteira. Dá para desfazer logo depois.
          </ConfirmDialog>
        </div>
      )}

      <div className={cn('mt-4', !fullPage && 'px-5')}>
        <p className="text-xs text-fg-muted">Saldo</p>
        <p className={cn('num mt-0.5 text-2xl font-semibold tracking-tight', balance < -0.005 && 'text-neg')}>{money(balance)}</p>
      </div>

      {cards.length > 0 && (
        <div className={cn('mt-4 flex flex-col gap-2', !fullPage && 'px-5')}>
          {cards.map((c) => (
            <CardBox key={c.card.id} c={c} />
          ))}
        </div>
      )}

      <WalletTabs
        name={wallet.name}
        walletId={wallet.id}
        data={data}
        events={events}
        padded={!fullPage}
        filter={filter}
        month={month}
        onFilter={onFilter}
        onMonth={onMonth}
      />
    </motion.article>
  )
}

/** Cartão pago por esta carteira: fatura do mês, vencimento e limite usado, compacto. */
function CardBox({ c }: { c: WalletCardInfo }) {
  const { money, date } = useAppData()
  const late = c.invoiceStatus === 'atrasada'
  const owing = c.invoiceBalance > 0.005 && Math.abs(c.invoiceBalance - c.invoiceTotal) > 0.005
  return (
    <section aria-label={`Cartão ${c.card.name}`} className="rounded-md border border-border px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-medium">Cartão {c.card.name}</h3>
        <Badge className={cn(late && 'border-neg/40 text-neg')}>{INV_TXT[c.invoiceStatus]}</Badge>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-x-4 text-xs">
        <div className="min-w-0">
          <dt className="truncate text-fg-muted" title={`Fatura de ${MONTHS[+c.invoiceKey.slice(5, 7) - 1]}`}>
            Fatura do mês
          </dt>
          <dd className="num mt-0.5 truncate text-sm font-medium" title={money(c.invoiceTotal)}>
            {money(c.invoiceTotal)}
          </dd>
          {owing && <dd className={cn('num truncate', late ? 'text-neg' : 'text-fg-subtle')}>falta {money(c.invoiceBalance)}</dd>}
        </div>
        <div className="min-w-0">
          <dt className="text-fg-muted">Vence</dt>
          <dd className={cn('num mt-0.5 text-sm font-medium', late && 'text-neg')}>{date(c.due)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-fg-muted">Limite usado</dt>
          <dd className="num mt-0.5 truncate text-sm font-medium" title={money(c.used)}>
            {money(c.used)}
          </dd>
          {c.limit > 0 && <dd className="num truncate text-fg-subtle">de {money(c.limit)}</dd>}
        </div>
      </dl>
      {c.usedPct !== null && (
        <div
          role="progressbar"
          aria-label={`Limite usado do cartão ${c.card.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(c.usedPct)}
          className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${c.usedPct}%` }} />
        </div>
      )}
    </section>
  )
}

function WalletTabs({
  name,
  walletId,
  data,
  events,
  padded,
  filter,
  month,
  onFilter,
  onMonth,
}: {
  name: string
  walletId: string
  data: AppData
  events: WalletEvent[]
  padded: boolean
  filter: MovementFilter
  month?: YearMonth
  onFilter: (f: MovementFilter) => void
  onMonth: (m: YearMonth | null) => void
}) {
  const [tab, setTab] = useState<Tab>('movimentos')
  const baseId = useId()
  return (
    <div className="mt-5">
      <Tabs
        baseId={baseId}
        label={`Informações de ${name}`}
        value={tab}
        onChange={setTab}
        className={cn(padded && 'px-3')}
        items={[
          { value: 'movimentos', label: 'Movimentos', count: events.length },
          { value: 'saldo', label: 'Saldo no tempo' },
        ]}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease }}
        >
          <TabPanel baseId={baseId} value={tab} className={cn('pt-4', padded ? 'px-5 pb-5' : 'pb-2')}>
            {tab === 'movimentos' && <Movements events={events} filter={filter} month={month} onFilter={onFilter} onMonth={onMonth} />}
            {tab === 'saldo' && (
              <Suspense fallback={<Skeleton className="h-48 w-full" />}>
                <WalletChart data={data} walletId={walletId} />
              </Suspense>
            )}
          </TabPanel>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------- movimentos

function Movements({
  events,
  filter,
  month,
  onFilter,
  onMonth,
}: {
  events: WalletEvent[]
  filter: MovementFilter
  month?: YearMonth
  onFilter: (f: MovementFilter) => void
  onMonth: (m: YearMonth | null) => void
}) {
  const { today, money } = useAppData()
  const range = useMemo(() => walletMonthRange(events, today), [events, today])
  const ym = clampMonth(month ?? ymOf(today), range)
  const view = useMemo(() => walletMonth(events, ym, filter, today), [events, ym, filter, today])
  const prev = stepMonth(ym, -1, range)
  const next = stepMonth(ym, 1, range)
  const title = monthTitle(ym)
  // mês de hoje sai da URL (é o padrão)
  const go = (m: YearMonth) => onMonth(m === ymOf(today) ? null : m)

  if (!events.length) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
        <Inbox aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
        Nenhum movimento nesta carteira ainda.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" disabled={!prev} onClick={() => prev && go(prev)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <div className="min-w-0 text-center">
          <h3 className="text-sm font-medium first-letter:uppercase">{title}</h3>
          <p className="num text-xs text-fg-muted">
            {view.monthIn > 0.005 || view.monthOut > 0.005 ? (
              <>
                entrou {money(view.monthIn)} · saiu {money(view.monthOut)}
              </>
            ) : view.total ? (
              'só transferências'
            ) : (
              'sem movimentos'
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Próximo mês" disabled={!next} onClick={() => next && go(next)}>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <Segmented
        id="carteira-tipo"
        label="Tipo de movimento"
        value={filter}
        onChange={onFilter}
        options={MOVEMENT_FILTERS.map((f) => ({ value: f, label: FILTER_LABEL[f] }))}
        // largura pelo conteúdo: "Transferências" não cabe em 1/4 da tela de 390px
        className="[&>button]:flex-auto [&>button]:px-1.5"
      />

      <p className="sr-only" role="status" aria-live="polite">
        {plural(view.shown, 'movimento', 'movimentos')}
        {filter !== 'todos' && ` (${FILTER_LABEL[filter].toLowerCase()})`} em {title}
      </p>

      {view.shown === 0 ? (
        <NoMovements
          filter={filter}
          title={title}
          monthHasAny={view.total > 0}
          latest={view.latestWith && view.latestWith !== ym ? view.latestWith : undefined}
          onAll={() => onFilter('todos')}
          onGo={go}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {view.days.map((d) => (
            <section key={d.date} aria-labelledby={`dia-${d.date}`}>
              <div className="flex items-baseline justify-between gap-3 px-1 pb-1.5">
                <h4 id={`dia-${d.date}`} className="text-xs font-medium text-fg-muted first-letter:uppercase">
                  {relativeDay(d.date, today)}
                </h4>
                <p className="num text-xs text-fg-subtle">
                  <span className="sr-only">Saldo ao fim do dia: </span>
                  <span aria-hidden="true">saldo </span>
                  {money(d.endBalance)}
                </p>
              </div>
              <ul className="rounded-md border border-border">
                {d.items.map((e) => (
                  <MovementRow key={e.key} e={e} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function MovementRow({ e }: { e: WalletEvent }) {
  const { canEdit, money, date, result } = useAppData()
  const { deleteTx } = useWalletActions()
  const [dlg, setDlg] = useState<'edit' | 'delete' | null>(null)
  // pagamento de empréstimo não se edita aqui: pertence à dívida (tela Pessoas)
  const txId = canEdit && !e.isLoan ? txIdFromKey(e.key) : null
  const exists = txId && result ? findTxIndex(result.data.transactions, txId) >= 0 : false
  const sub = [e.isTransfer ? 'transferência' : e.isLoan ? 'empréstimo' : e.kind === 'entrada' ? 'entrada' : 'saída', e.note]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm">
          {e.isTransfer && <ArrowLeftRight aria-hidden="true" className="size-3.5 shrink-0 text-fg-subtle" />}
          <span className="truncate">{e.label}</span>
        </span>
        <span className="block truncate text-xs text-fg-subtle">{sub}</span>
      </span>
      {/* transferência só muda de lugar: valor com sinal, sem cor */}
      <SignedMoney value={e.kind === 'entrada' ? e.amount : -e.amount} muted={e.isTransfer} className="text-sm" />
      {txId && exists && (
        <span className="-mr-2 flex">
          <Button size="icon" variant="ghost" className="size-8" aria-label="Editar lançamento" title="Editar" onClick={() => setDlg('edit')}>
            <Pencil />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Excluir lançamento" title="Excluir" onClick={() => setDlg('delete')}>
            <Trash2 />
          </Button>
          <TxFormDialog open={dlg === 'edit'} onClose={() => setDlg(null)} txId={txId} />
          <ConfirmDialog open={dlg === 'delete'} onClose={() => setDlg(null)} title="Excluir lançamento" okLabel="Excluir" onOk={() => deleteTx(txId, money(e.amount))}>
            Excluir <b className="text-fg">{e.label}</b> de <b className="num text-fg">{money(e.amount)}</b> em <span className="num">{date(e.date)}</span>? Dá para
            desfazer logo depois.
          </ConfirmDialog>
        </span>
      )}
    </li>
  )
}

function NoMovements({
  filter,
  title,
  monthHasAny,
  latest,
  onAll,
  onGo,
}: {
  filter: MovementFilter
  title: string
  monthHasAny: boolean
  latest?: YearMonth
  onAll: () => void
  onGo: (m: YearMonth) => void
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-border px-6 py-8 text-center">
      <SearchX aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-sm text-fg-muted">
        {FILTER_NONE[filter]} em {title}.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {filter !== 'todos' && monthHasAny && (
          <Button variant="outline" size="sm" onClick={onAll}>
            Ver todos os tipos
          </Button>
        )}
        {latest && (
          <Button variant="ghost" size="sm" onClick={() => onGo(latest)}>
            Ir para {monthTitle(latest)}
          </Button>
        )}
      </div>
    </div>
  )
}

function NotFound({ backHref, fullPage }: { backHref: string; fullPage: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <Wallet aria-hidden="true" className="size-5 text-fg-subtle" />
      {fullPage ? <h1 className="mt-3 text-base font-medium">Carteira não encontrada</h1> : <h2 className="mt-3 text-base font-medium">Carteira não encontrada</h2>}
      <p className="mt-1 max-w-xs text-sm text-fg-muted">Ela pode ter sido excluída no BarnaBank, ou o link está incompleto.</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to={backHref}>Voltar para Carteiras</Link>
      </Button>
    </div>
  )
}
