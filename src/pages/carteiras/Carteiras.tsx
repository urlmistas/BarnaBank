import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeftRight, Plus, Wallet } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { buildWalletRows, monthInOut, MOVEMENT_FILTERS, type MovementFilter } from '@/lib/finance/wallets'
import { parseISO } from '@/lib/finance/dates'
import { MONTHS, plural } from '@/lib/format'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import type { AppData, YearMonth } from '@/lib/types'
import { WalletList } from './WalletList'
import { WalletDetailView } from './WalletDetail'
import { TxFormDialog, WalletFormDialog } from './dialogs'
import { ImportStatementButton } from './import-dialog'

// Carteiras: saldo total em destaque, uma linha por carteira. No PC (≥1024px) a carteira
// abre num painel ao lado; no celular /carteiras/:id é uma página inteira (como Pessoas).
// Mês e tipo de movimento do detalhe ficam na URL (?m=AAAA-MM&t=saidas).

const ease = [0.2, 0, 0, 1] as const
const YM_RE = /^\d{4}-\d{2}$/

export function Carteiras() {
  const { status, result, today } = useAppData()
  if (status === 'loading' || !result) return <CarteirasSkeleton />
  return <CarteirasReady data={result.data} today={today} />
}

function CarteirasReady({ data, today }: { data: AppData; today: string }) {
  const { id } = useParams()
  const { money, canCreate, canEdit } = useAppData()
  const [dlg, setDlg] = useState<'wallet' | 'tx' | null>(null)
  const wide = useMediaQuery('(min-width: 1024px)')
  const [params, setParams] = useSearchParams()
  const rawT = params.get('t') as MovementFilter | null
  const filter: MovementFilter = rawT && MOVEMENT_FILTERS.includes(rawT) ? rawT : 'todos'
  const rawM = params.get('m')
  const month: YearMonth | undefined = rawM && YM_RE.test(rawM) ? rawM : undefined

  const view = useMemo(() => {
    const t = parseISO(today)
    return { rows: buildWalletRows(data, today), month: monthInOut(data, t.getFullYear(), t.getMonth()) }
  }, [data, today])

  const update = (next: { t?: MovementFilter; m?: YearMonth | null }) => {
    const p = new URLSearchParams(params)
    const t = next.t ?? filter
    if (t === 'todos') p.delete('t')
    else p.set('t', t)
    if (next.m !== undefined) {
      if (next.m) p.set('m', next.m)
      else p.delete('m')
    }
    setParams(p, { replace: true })
  }
  const qs = params.toString()
  const listHref = '/carteiras' + (qs ? '?' + qs : '')

  const detail = (fullPage: boolean) =>
    id ? (
      <WalletDetailView
        key={fullPage ? id : undefined}
        walletId={id}
        data={data}
        backHref={listHref}
        fullPage={fullPage}
        filter={filter}
        month={month}
        onFilter={(t) => update({ t })}
        onMonth={(m) => update({ m })}
      />
    ) : null

  // celular com carteira aberta: só o detalhe
  if (id && !wide) return detail(true)

  const has = view.rows.length > 0
  const total = view.rows.reduce((s, r) => s + r.balance, 0)

  return (
    <div>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Carteiras</h1>
          {has && (
            <div className="mt-4">
              <p className="text-sm text-fg-muted">
                Saldo total <span className="num text-fg-subtle">· {plural(view.rows.length, 'carteira', 'carteiras')}</span>
              </p>
              <p className={cn('num mt-1 text-4xl font-semibold tracking-tight', total < -0.005 && 'text-neg')}>{money(total)}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          {canCreate && (
            <div className="flex flex-wrap gap-2">
              {(has || data.cards.length > 0) && <ImportStatementButton data={data} />}
              {canEdit && has && (
                <Button size="sm" variant="outline" onClick={() => setDlg('tx')}>
                  <ArrowLeftRight aria-hidden="true" />
                  Novo lançamento
                </Button>
              )}
              <Button size="sm" onClick={() => setDlg('wallet')}>
                <Plus aria-hidden="true" />
                Nova carteira
              </Button>
            </div>
          )}
          {has && <MonthFigures monthIn={view.month.monthIn} monthOut={view.month.monthOut} today={today} />}
        </div>
      </header>

      <div className={cn('mt-6', has && 'lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-8')}>
        <WalletList rows={view.rows} selectedId={wide ? id : undefined} search={qs} onCreate={canCreate ? () => setDlg('wallet') : undefined} />
        {has && wide && (
          <aside aria-label="Carteira selecionada" className="lg:sticky lg:top-20">
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
      <WalletFormDialog open={dlg === 'wallet'} onClose={() => setDlg(null)} />
      <TxFormDialog open={dlg === 'tx'} onClose={() => setDlg(null)} />
    </div>
  )
}

/** Duas medidas só: entrou e saiu no mês (as mesmas do Início, sem transferências). */
function MonthFigures({ monthIn, monthOut, today }: { monthIn: number; monthOut: number; today: string }) {
  const { money } = useAppData()
  const month = MONTHS[parseISO(today).getMonth()]
  const items = [
    { label: `Entrou em ${month}`, value: monthIn },
    { label: `Saiu em ${month}`, value: monthOut },
  ]
  return (
    <dl className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border bg-surface lg:min-w-[360px]">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 px-4 py-3 sm:px-5">
          <dt className="truncate text-xs text-fg-muted">{it.label}</dt>
          <dd className="num mt-1 truncate text-base font-semibold tracking-tight sm:text-lg" title={money(it.value)}>
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
      <Wallet aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-sm font-medium">Escolha uma carteira</p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">Ela abre aqui, com os movimentos de cada mês e o saldo ao longo do tempo.</p>
    </div>
  )
}

function CarteirasSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-8 w-36" />
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-11 w-56" />
        </div>
        <Skeleton className="h-[70px] w-full rounded-lg lg:w-[360px]" />
      </div>
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-8">
        <div className="rounded-lg border border-border bg-surface">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0">
              <div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-96 rounded-lg lg:block" />
      </div>
    </div>
  )
}
