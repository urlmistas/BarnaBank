import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Check, ChevronDown, Circle, CircleAlert, CircleDashed, Image, Inbox, Paperclip, Pencil, Trash2, UserRound, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TabPanel, Tabs } from '@/components/ui/tabs'
import { personDetail, type DebtView, type HistoryItem, type InstView, type PersonDetail } from '@/lib/finance/people'
import type { DebtCalc } from '@/lib/finance/debts'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppData, Debt } from '@/lib/types'
import { Avatar, SignedMoney } from './parts'
import { DebtActions } from './DebtActions'
import { ShareButton } from './share-dialog'
import { PersonExtra } from './PersonExtra'
import { ConfirmDialog, EditPaymentDialog } from './dialogs'
import { useDebtActions } from './use-debt-actions'
import { ReceiptDialog } from './receipt-ui'
import { useReceiptActions } from './use-receipts'
import { receiptIdOf } from '@/lib/receipts/store'

const PersonCalendar = lazy(() => import('./PersonCalendar').then((m) => ({ default: m.PersonCalendar })))

const ease = [0.2, 0, 0, 1] as const
type Tab = 'dividas' | 'historico' | 'calendario'

export function PersonDetailView({
  personKey,
  data,
  calc,
  backHref,
  fullPage = false,
}: {
  personKey: string
  data: AppData
  calc: DebtCalc
  backHref: string
  fullPage?: boolean
}) {
  const { today, date } = useAppData()
  const p = useMemo(() => personDetail(data, personKey, today, date, calc), [data, personKey, today, date, calc])
  const headingRef = useRef<HTMLHeadingElement>(null)

  // página inteira (celular): o foco vai para o nome, como numa navegação nova
  useEffect(() => {
    if (fullPage) headingRef.current?.focus()
  }, [fullPage])

  if (!p) return <NotFound backHref={backHref} fullPage={fullPage} />

  const H = fullPage ? 'h1' : 'h2'
  return (
    <motion.article
      aria-labelledby="pessoa-nome"
      initial={fullPage ? { opacity: 0, x: 12 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease }}
      className={cn(!fullPage && 'rounded-lg border border-border bg-surface')}
    >
      {fullPage && (
        <Button asChild variant="ghost" size="sm" className="-ml-2.5 mb-4">
          <Link to={backHref}>
            <ArrowLeft aria-hidden="true" /> Pessoas
          </Link>
        </Button>
      )}
      <header className={cn('flex items-start gap-3', !fullPage && 'px-5 pt-5')}>
        <Avatar name={p.name} size="lg" />
        <div className="min-w-0 flex-1 pt-0.5">
          <H id="pessoa-nome" ref={headingRef} tabIndex={-1} className="truncate text-lg font-semibold tracking-tight outline-none">
            {p.name}
          </H>
          <p className="text-sm text-fg-muted">
            {plural(p.debts.length, 'dívida', 'dívidas')} · desde <span className="num">{date(p.since)}</span>
          </p>
        </div>
        {!fullPage && (
          <Button asChild variant="ghost" size="icon" className="-mt-1 -mr-2">
            <Link to={backHref} aria-label="Fechar pessoa" title="Fechar">
              <X aria-hidden="true" />
            </Link>
          </Button>
        )}
      </header>

      <div className={cn('mt-3 flex flex-wrap gap-1', !fullPage && 'mx-4')}>
        {p.hasReceivable && <ShareButton type="person" refKey={p.key} label={p.name} />}
        {p.hasPayable && <ShareButton type="owe" refKey={p.key} label={p.name} />}
      </div>

      <PersonFigures p={p} className={cn('mt-5', !fullPage && 'mx-5')} />
      <div className={cn(!fullPage && 'mx-5')}>
        <PersonExtra personKey={p.key} name={p.name} />
      </div>
      <PersonTabs p={p} padded={!fullPage} />
    </motion.article>
  )
}

function PersonFigures({ p, className }: { p: PersonDetail; className?: string }) {
  const { money } = useAppData()
  const t = p.totals
  const items: { label: string; value: number; tone?: string }[] = []
  if (p.hasReceivable) {
    items.push({ label: 'Falta receber', value: t.toReceive })
    items.push({ label: 'Em atraso', value: t.overdue, tone: t.overdue > 0.005 ? 'text-neg' : undefined })
    items.push({ label: 'Já recebi', value: t.received })
  }
  if (p.hasPayable) {
    items.push({ label: 'Eu devo', value: t.owe })
    items.push({ label: 'Já paguei', value: t.paidOut })
  }
  return (
    <dl className={cn('grid grid-cols-3 gap-x-4 gap-y-3 rounded-md border border-border px-4 py-3', className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-fg-muted">{it.label}</dt>
          <dd className={cn('num mt-0.5 truncate text-sm font-medium', it.tone)} title={money(it.value)}>
            {money(it.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function PersonTabs({ p, padded }: { p: PersonDetail; padded: boolean }) {
  const [tab, setTab] = useState<Tab>('dividas')
  const baseId = useId()
  return (
    <div className="mt-5">
      <Tabs
        baseId={baseId}
        label={`Informações de ${p.name}`}
        value={tab}
        onChange={setTab}
        className={cn(padded && 'px-3')}
        items={[
          { value: 'dividas', label: 'Dívidas', count: p.debts.length },
          { value: 'historico', label: 'Histórico', count: p.history.length },
          { value: 'calendario', label: 'Calendário' },
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
            {tab === 'dividas' && (
              <div className="flex flex-col gap-3">
                {p.debts.map((v) => (
                  <DebtCard key={v.debt.id} v={v} />
                ))}
              </div>
            )}
            {tab === 'historico' && <History items={p.history} debts={p.debts.map((v) => v.debt)} />}
            {tab === 'calendario' && (
              <Suspense fallback={<div className="h-80" />}>
                <PersonCalendar p={p} />
              </Suspense>
            )}
          </TabPanel>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------- dívida

function statusText(v: DebtView, money: (n: number) => string): { text: string; late: boolean } {
  switch (v.status) {
    case 'pago':
      return { text: v.debt.discount > 0.005 ? 'quitada com desconto' : 'quitada', late: false }
    case 'atrasado':
      return { text: `${money(v.overdue)} em atraso · ${plural(v.overdueCount, 'parcela', 'parcelas')}`, late: true }
    case 'hoje':
      return { text: 'vence hoje', late: false }
    case 'embreve':
      return { text: `vence em ${plural(v.daysUntil ?? 0, 'dia', 'dias')}`, late: false }
    default:
      return { text: 'em dia', late: false }
  }
}

function metaLine(v: DebtView, money: (n: number) => string, date: (iso: string) => string): string {
  const d = v.debt
  const pay = v.kind === 'payable'
  const parts = [(pay ? 'Dívida de ' : 'Emprestado em ') + date(d.date)]
  if (d.recurring) parts.push('todo mês · ' + money(d.recurring.amount))
  else if (d.plan) parts.push(`${v.n} parcelas (plano próprio)`)
  else parts.push(v.n > 1 ? `${v.n}x de ${money(v.instValue)}` : 'parcela única')
  if (d.plan) parts.push('renegociada')
  else if (d.rate > 0) parts.push(`juros ${String(d.rate).replace('.', ',')}% a.m. (${d.interestType === 'simples' ? 'simples' : d.interestType === 'price' ? 'Price' : 'composto'})`)
  else parts.push('sem juros')
  return parts.join(' · ')
}

const INST_WINDOW = 6

function DebtCard({ v }: { v: DebtView }) {
  const { money, date } = useAppData()
  const [open, setOpen] = useState(!v.paid)
  const [all, setAll] = useState(false)
  const listId = useId()
  const st = statusText(v, money)
  const pay = v.kind === 'payable'
  const d = v.debt

  // muitas parcelas: mostra uma janela a partir da primeira em aberto
  const firstOpen = Math.max(0, v.insts.findIndex((it) => it.open > 0))
  const start = Math.max(0, Math.min(firstOpen - 1, v.insts.length - INST_WINDOW))
  const windowed = !all && v.insts.length > INST_WINDOW + 2
  const insts = windowed ? v.insts.slice(start, start + INST_WINDOW) : v.insts

  const extras: { label: string; value: string }[] = []
  if (v.penaltiesCharged > 0.005)
    extras.push({ label: `Encargos (multa ${String(d.lateFeePct).replace('.', ',')}% + mora ${String(d.lateInterestPct).replace('.', ',')}%/mês)`, value: money(v.penaltiesCharged) })
  if (d.discount > 0.005) extras.push({ label: 'Desconto concedido', value: money(d.discount) })
  if (v.credit > 0.005) extras.push({ label: pay ? 'Paguei a mais' : 'Recebido a mais', value: money(v.credit) })

  return (
    <Card aria-label={v.label} className="overflow-hidden">
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-sm font-medium">{v.label}</h3>
              <Badge>{pay ? 'a pagar' : 'a receber'}</Badge>
            </div>
            <p className={cn('mt-0.5 text-xs', st.late ? 'text-neg' : 'text-fg-subtle')}>{st.text}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="num text-base font-semibold tracking-tight">{money(v.paid ? v.paidAmount : v.remaining)}</p>
            <p className="num text-xs text-fg-subtle">
              {v.paid ? (pay ? 'pago no total' : 'recebido no total') : `falta de ${money(v.total)}`}
            </p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={pay ? 'Quanto já paguei' : 'Quanto já recebi'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(v.progress)}
          className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${v.progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-fg-muted">{metaLine(v, money, date)}</p>
        {d.notes && <p className="mt-1 line-clamp-2 text-xs text-fg-subtle">{d.notes}</p>}
        {extras.length > 0 && (
          <dl className="mt-2 flex flex-col gap-0.5 text-xs">
            {extras.map((x) => (
              <div key={x.label} className="flex justify-between gap-3">
                <dt className="text-fg-muted">{x.label}</dt>
                <dd className="num">{x.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <DebtActions debt={d} paid={v.paid} />

      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <span>
          Parcelas <span className="num text-fg-subtle">{v.covered}/{v.n} quitadas</span>
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={listId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease }}
            className="overflow-hidden"
          >
            <ol aria-label={`Parcelas de ${v.label}`} className="border-t border-border">
              {insts.map((it) => (
                <InstRow key={it.i} it={it} pay={pay} />
              ))}
            </ol>
            {v.insts.length > INST_WINDOW + 2 && (
              <div className="border-t border-border px-2 py-1">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setAll((a) => !a)} aria-controls={listId}>
                  {all ? 'Mostrar menos' : `Ver todas as ${v.insts.length} parcelas`}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function InstRow({ it, pay }: { it: InstView; pay: boolean }) {
  const { money, date } = useAppData()
  let label: string
  let detail = ''
  if (it.state === 'paga') {
    label = pay ? 'Paga' : 'Recebida'
    if (it.lastPayISO) detail = `em ${date(it.lastPayISO)}` + (it.timing === 'late' ? ' (com atraso)' : it.timing === 'early' ? ' (adiantada)' : '')
  } else {
    label = it.state === 'atrasada' ? 'Em atraso' : it.state === 'parcial' ? 'Parcial' : 'Em aberto'
    if (it.state === 'atrasada' || it.state === 'parcial' || it.paid > 0) detail = `falta ${money(it.open)}`
    if (it.paid > 0) detail += ` · já ${pay ? 'pago' : 'recebido'} ${money(it.paid)}`
    if (it.pen > 0.005) detail += ` · encargos ${money(it.pen)}`
  }
  const Icon = it.state === 'paga' ? Check : it.state === 'atrasada' ? CircleAlert : it.state === 'parcial' ? CircleDashed : Circle
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border px-4 py-2 last:border-b-0">
      <Icon
        aria-hidden="true"
        className={cn('size-4', it.state === 'atrasada' ? 'text-neg' : it.state === 'paga' ? 'text-fg-muted' : 'text-fg-subtle')}
      />
      <span className="min-w-0">
        <span className="block text-sm">
          <span className="num text-fg-subtle">{it.i + 1}/{it.n}</span>
          <span className="num ml-2">{date(it.dueISO)}</span>
        </span>
        <span className={cn('block truncate text-xs', it.state === 'atrasada' ? 'text-neg' : 'text-fg-subtle')}>
          {label}
          {detail && ' · ' + detail}
        </span>
      </span>
      <span className={cn('num text-sm', it.state === 'paga' ? 'text-fg-muted' : 'text-fg')}>{money(it.value)}</span>
    </li>
  )
}

// ---------------------------------------------------------------- histórico

function History({ items, debts }: { items: HistoryItem[]; debts: Debt[] }) {
  const { date, canEdit } = useAppData()
  const [editing, setEditing] = useState<{ debtId: string; index: number } | null>(null)
  const [removing, setRemoving] = useState<{ debtId: string; index: number } | null>(null)
  const debtOf = (id: string) => debts.find((d) => d.id === id)
  if (!items.length) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
        <Inbox aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
        Nenhum pagamento registrado ainda.
      </div>
    )
  }
  const editDebt = editing ? debtOf(editing.debtId) : undefined
  const removeDebtOf = removing ? debtOf(removing.debtId) : undefined
  return (
    <>
      <ul aria-label="Pagamentos" className="rounded-md border border-border">
        {items.map((h) => (
          <li key={h.key} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
            <span className="num w-16 shrink-0 text-sm text-fg-muted">{date(h.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{h.dir === 'in' ? 'Recebi' : 'Paguei'}</span>
              <span className="block truncate text-xs text-fg-subtle">
                {[h.debtLabel, h.target ? `parcela ${h.target}` : '', h.walletName, h.note].filter(Boolean).join(' · ')}
              </span>
            </span>
            <SignedMoney value={h.dir === 'in' ? h.amount : -h.amount} className="text-sm" />
            {debtOf(h.debtId) && <ReceiptButton debt={debtOf(h.debtId)!} index={h.index} />}
            {canEdit && (
              <span className="-mr-2 flex">
                <Button size="icon" variant="ghost" className="size-8" aria-label="Editar pagamento" title="Editar" onClick={() => setEditing({ debtId: h.debtId, index: h.index })}>
                  <Pencil />
                </Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="Remover pagamento" title="Remover" onClick={() => setRemoving({ debtId: h.debtId, index: h.index })}>
                  <Trash2 />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {editDebt && editing && <EditPaymentDialog open onClose={() => setEditing(null)} debt={editDebt} index={editing.index} />}
      {removeDebtOf && removing && <RemovePayment debt={removeDebtOf} index={removing.index} onClose={() => setRemoving(null)} />}
    </>
  )
}

/** clipe (anexar) ou imagem (ver) do comprovante de um pagamento */
function ReceiptButton({ debt, index }: { debt: Debt; index: number }) {
  const { canEdit } = useAppData()
  const { attach, remove } = useReceiptActions(debt)
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const has = !!receiptIdOf(debt.payments[index])
  const pick = () => {
    if (input.current) input.current.value = ''
    input.current?.click()
  }
  if (!has && !canEdit) return null
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label={has ? 'Ver comprovante' : 'Anexar comprovante'}
        title={has ? 'Ver comprovante' : 'Anexar comprovante'}
        onClick={() => (has ? setOpen(true) : pick())}
      >
        {has ? <Image className="text-accent-text" /> : <Paperclip />}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Foto do comprovante"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void attach(index, f)
        }}
      />
      {open && <ReceiptDialog debt={debt} index={index} onClose={() => setOpen(false)} onSwap={pick} onRemove={() => remove(index)} />}
    </>
  )
}

function RemovePayment({ debt, index, onClose }: { debt: Debt; index: number; onClose: () => void }) {
  const { money, date } = useAppData()
  const { removePayment } = useDebtActions(debt)
  const p = debt.payments[index]
  return (
    <ConfirmDialog open onClose={onClose} title="Remover pagamento" okLabel="Remover" onOk={() => removePayment(index)}>
      {p ? (
        <>
          Remover o pagamento de <b className="num text-fg">{money(p.amount)}</b> em <span className="num">{date(p.date)}</span>? Dá para desfazer logo depois.
        </>
      ) : (
        'Pagamento não encontrado.'
      )}
    </ConfirmDialog>
  )
}

function NotFound({ backHref, fullPage }: { backHref: string; fullPage: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <UserRound aria-hidden="true" className="size-5 text-fg-subtle" />
      {fullPage ? <h1 className="mt-3 text-base font-medium">Pessoa não encontrada</h1> : <h2 className="mt-3 text-base font-medium">Pessoa não encontrada</h2>}
      <p className="mt-1 max-w-xs text-sm text-fg-muted">Não há dívidas com esse nome. Ela pode ter sido renomeada ou excluída no BarnaBank.</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to={backHref}>Voltar para Pessoas</Link>
      </Button>
    </div>
  )
}
