import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, BanknoteArrowUp, CalendarClock, Check, ChevronDown, Circle, CircleAlert, CircleCheck, CircleDashed, ClockAlert, FileDown, HandCoins, Image, Inbox, MessageCircle, Paperclip, Pencil, PiggyBank, Plus, ReceiptText, Trash2, UserRound, type LucideIcon } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TabPanel, Tabs } from '@/components/ui/tabs'
import { personFacts } from '@/lib/finance/person-facts'
import { formatPhone, notesOf, tagsOf } from '@/lib/finance/person-extra'
import { personSheetHtml } from '@/lib/print/documents'
import { openPrintWindow } from '@/lib/print/html'
import { useDocCtx } from '@/lib/print/use-doc-ctx'
import { useToast } from '@/components/ui/toast'
import { whatsPhone } from '@/lib/finance/groups'
import { whatsappLink } from '@/lib/finance/whatsapp'
import { chargeLinkFor } from './charge-link'
import { personDetail, type DebtView, type HistoryItem, type InstView, type PersonDetail } from '@/lib/finance/people'
import type { DebtCalc } from '@/lib/finance/debts'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppData, Debt } from '@/lib/types'
import { Avatar, SignedMoney, StatusBadge } from './parts'
import { DebtActions } from './DebtActions'
import { ShareButton } from './share-dialog'
import { EditPersonButton, TagsNotes, TrustSummary } from './PersonExtra'
import { ConfirmDialog, DebtFormDialog, EditPaymentDialog } from './dialogs'
import { useDebtActions } from './use-debt-actions'
import { ReceiptDialog } from './receipt-ui'
import { useReceiptActions } from './use-receipts'
import { receiptIdOf } from '@/lib/receipts/store'

const PersonChart = lazy(() => import('./PersonChart').then((m) => ({ default: m.PersonChart })))
const PersonTimeline = lazy(() => import('./PersonTimeline').then((m) => ({ default: m.PersonTimeline })))
const PersonCalendar = lazy(() => import('./PersonCalendar').then((m) => ({ default: m.PersonCalendar })))

const ease = [0.2, 0, 0, 1] as const
type Tab = 'receber' | 'pagar' | 'historico' | 'grafico' | 'calendario' | 'linha'

export function PersonDetailView({
  personKey,
  data,
  calc,
  backHref,
}: {
  personKey: string
  data: AppData
  calc: DebtCalc
  backHref: string
}) {
  const { today, date, money, canCreate, baseSettings } = useAppData()
  const p = useMemo(() => personDetail(data, personKey, today, date, calc), [data, personKey, today, date, calc])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [newDebt, setNewDebt] = useState(false)
  const doc = useDocCtx()
  const toast = useToast()

  // página própria da pessoa: o foco vai para o nome, como numa navegação nova
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  if (!p) return <NotFound backHref={backHref} />

  const f = personFacts(p, today)
  const phone = whatsPhone(data.contacts[p.key]?.phone)
  // "Cobrar": WhatsApp com a mensagem pronta da dívida atrasada que me devem (a mais antiga primeiro)
  const lateDebt = p.debts.find((v) => v.kind !== 'payable' && !v.paid && v.status === 'atrasado')
  const chargeHref = lateDebt
    ? whatsappLink(lateDebt.debt, data.contacts[p.key], {
        today,
        money,
        date,
        groupTitle: lateDebt.groupTitle,
        pixKey: typeof baseSettings.pixKey === 'string' ? baseSettings.pixKey : undefined,
        link: chargeLinkFor(lateDebt.debt),
      })
    : null
  const t = p.totals
  const tiles: { label: string; value: number; icon: LucideIcon; tone?: string }[] = []
  if (p.hasReceivable) {
    tiles.push({ label: 'Falta receber', value: t.toReceive, icon: CalendarClock })
    tiles.push({ label: 'Em atraso', value: t.overdue, icon: ClockAlert, tone: t.overdue > 0.005 ? 'text-neg' : undefined })
    tiles.push({ label: 'Já recebi', value: t.received, icon: HandCoins, tone: t.received > 0.005 ? 'text-pos' : undefined })
    tiles.push({ label: 'Total emprestado', value: t.lent, icon: PiggyBank })
  }
  if (p.hasPayable) {
    tiles.push({ label: 'Eu devo', value: t.owe, icon: ReceiptText })
    tiles.push({ label: 'Já paguei', value: t.paidOut, icon: BanknoteArrowUp })
  }

  return (
    <motion.article aria-labelledby="pessoa-nome" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease }}>
      <Button asChild variant="ghost" size="sm" className="-ml-2.5 mb-4">
        <Link to={backHref}>
          <ArrowLeft aria-hidden="true" /> Pessoas
        </Link>
      </Button>

      <Card className="p-4 sm:p-6">
        <header className="flex flex-wrap items-start gap-4">
          <span className="relative shrink-0">
            <Avatar name={p.name} size="lg" />
            <StatusBadge status={f.status} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 id="pessoa-nome" ref={headingRef} tabIndex={-1} className="truncate text-2xl font-semibold tracking-tight outline-none">
                {p.name}
              </h1>
              <EditPersonButton personKey={p.key} name={p.name} />
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              {plural(p.debts.length, 'dívida', 'dívidas')} · desde <span className="num">{date(p.since)}</span>
            </p>
          </div>
          <div className="flex w-full items-baseline justify-between gap-3 border-t border-border pt-3 sm:block sm:w-auto sm:border-0 sm:pt-0 sm:text-right">
            <p className="text-xs text-fg-muted">{f.net > 0.005 ? 'Saldo a receber' : f.net < -0.005 ? 'Saldo que eu devo' : 'Saldo zerado'}</p>
            <SignedMoney value={f.net} className="text-2xl" />
          </div>
        </header>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {canCreate && (
            <Button size="sm" onClick={() => setNewDebt(true)}>
              <Plus aria-hidden="true" />
              Nova dívida
            </Button>
          )}
          {chargeHref && (
            <Button asChild size="sm" variant="outline">
              <a href={chargeHref} target="_blank" rel="noreferrer" aria-label="Cobrar">
                <HandCoins aria-hidden="true" />
                <span className="hidden sm:inline">Cobrar</span>
              </a>
            </Button>
          )}
          {phone && (
            <Button asChild size="sm" variant="outline">
              <a href={'https://wa.me/' + phone} target="_blank" rel="noreferrer" aria-label="Conversar">
                <MessageCircle aria-hidden="true" />
                <span className="hidden sm:inline">Conversar</span>
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            aria-label="Exportar ficha"
            onClick={() => {
              const c = data.contacts[p.key]
              const html = personSheetHtml({ p, facts: f, phone: formatPhone(c?.phone), tags: tagsOf(c), notes: notesOf(c) }, { ...doc, issuedAt: new Date() })
              if (!openPrintWindow(html)) toast.show('Seu navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.')
            }}
          >
            <FileDown aria-hidden="true" />
            <span className="hidden sm:inline">Exportar ficha</span>
          </Button>
          {p.hasReceivable && <ShareButton type="person" refKey={p.key} label={p.name} />}
          {p.hasPayable && <ShareButton type="owe" refKey={p.key} label={p.name} />}
        </div>
        {tiles.length > 0 && (
          <dl
            className={cn(
              'mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border',
              tiles.length >= 6 ? 'sm:grid-cols-3' : tiles.length >= 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-2',
            )}
          >
            {tiles.map((it) => (
              <div key={it.label} className="min-w-0 bg-surface px-4 py-3">
                <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <it.icon aria-hidden="true" className={cn('size-3.5 shrink-0', it.tone ?? 'text-fg-subtle')} />
                  {it.label}
                </dt>
                <dd className={cn('num mt-1 truncate text-lg font-semibold tracking-tight', it.tone)} title={money(it.value)}>
                  {money(it.value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <div className="mt-4">
        <PersonTabs
          p={p}
          side={
            <aside aria-label={`Informações de ${p.name}`} className="flex flex-col gap-4">
              <Card>
                <CardContent className="pt-5">
                  <TrustSummary personKey={p.key} />
                  <h2 className="mt-5 border-t border-border pt-4 pb-2 text-sm font-medium">Resumo</h2>
                  <dl className="divide-y divide-border text-sm">
                    <Fact label="Dívidas em aberto" value={String(f.openCount)} />
                    <Fact
                      label="Dívidas em atraso"
                      value={f.lateCount ? `${f.lateCount} · ${plural(f.lateInstallments, 'parcela', 'parcelas')}` : '0'}
                      tone={f.lateCount ? 'text-neg' : undefined}
                    />
                    <Fact label="Dívidas quitadas" value={String(f.paidCount)} />
                    <Fact label="Próximo vencimento" value={f.nextDue ? date(f.nextDue) : '—'} />
                    <Fact label="Quitação prevista" value={f.payoffDate ? date(f.payoffDate) : '—'} />
                    <Fact label="Último pagamento" value={f.lastPayment ? date(f.lastPayment) : '—'} />
                    <Fact label="Pagamentos registrados" value={String(f.paymentsCount)} />
                    <Fact label="Cliente desde" value={date(p.since)} />
                  </dl>
                  <TagsNotes personKey={p.key} className="mt-4 border-t border-border pt-4" />
                </CardContent>
              </Card>
            </aside>
          }
        />
      </div>

      <DebtFormDialog open={newDebt} onClose={() => setNewDebt(false)} initialName={p.name} kind={p.hasReceivable || !p.hasPayable ? 'receivable' : 'payable'} />
    </motion.article>
  )
}

/** selinho redondo no canto inferior direito da inicial: atraso (vermelho), em dia (verde) ou quitado (neutro) */
function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={cn('num font-medium', tone)}>{value}</dd>
    </div>
  )
}

function PersonTabs({ p, side }: { p: PersonDetail; side: ReactNode }) {
  const toReceive = p.debts.filter((v) => v.kind === 'receivable')
  const toPay = p.debts.filter((v) => v.kind === 'payable')
  const [tab, setTab] = useState<Tab>(toReceive.length || !toPay.length ? 'receber' : 'pagar')
  const baseId = useId()
  const items: { value: Tab; label: string; count?: number }[] = []
  if (toReceive.length || !toPay.length) items.push({ value: 'receber', label: 'Me deve', count: toReceive.length })
  if (toPay.length) items.push({ value: 'pagar', label: 'Eu devo', count: toPay.length })
  items.push({ value: 'historico', label: 'Histórico', count: p.history.length }, { value: 'grafico', label: 'Gráfico' }, { value: 'calendario', label: 'Calendário' }, { value: 'linha', label: 'Linha do tempo' })
  const list = tab === 'pagar' ? toPay : toReceive
  // só a primeira dívida em aberto vem aberta; as quitadas e as outras abrem ao clicar
  const firstOpenId = list.find((v) => !v.paid)?.debt.id
  return (
    <div className="min-w-0">
      <Tabs baseId={baseId} label={`Informações de ${p.name}`} value={tab} onChange={setTab} items={items} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="min-w-0"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease }}
          >
            <TabPanel baseId={baseId} value={tab}>
              {(tab === 'receber' || tab === 'pagar') && (
                <div className="flex flex-col gap-3">
                  {list.map((v) => (
                    <DebtCard key={v.debt.id} v={v} defaultOpen={v.debt.id === firstOpenId} />
                  ))}
                </div>
              )}
              {tab === 'historico' && <History items={p.history} debts={p.debts.map((v) => v.debt)} />}
              {tab === 'grafico' && (
                <Suspense fallback={<div className="h-80" />}>
                  <PersonChart p={p} />
                </Suspense>
              )}
              {tab === 'linha' && (
                <Suspense fallback={<div className="h-80" />}>
                  <PersonTimeline p={p} />
                </Suspense>
              )}
              {tab === 'calendario' && (
                <Suspense fallback={<div className="h-80" />}>
                  <PersonCalendar p={p} />
                </Suspense>
              )}
            </TabPanel>
          </motion.div>
        </AnimatePresence>
        {side}
      </div>
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

function DebtCard({ v, defaultOpen }: { v: DebtView; defaultOpen: boolean }) {
  const { money, date } = useAppData()
  const [open, setOpen] = useState(defaultOpen)
  const [showInsts, setShowInsts] = useState(false)
  const [all, setAll] = useState(false)
  const bodyId = useId()
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
    <Card aria-label={v.label} className={cn('relative overflow-hidden transition duration-200', v.paid && 'opacity-60 saturate-50 hover:opacity-100 hover:saturate-100 focus-within:opacity-100 focus-within:saturate-100')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className={cn('block w-full cursor-pointer px-4 pt-3.5 pb-3 text-left transition-colors hover:bg-surface-2', v.paid && 'pl-11')}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn('truncate text-sm font-medium', v.paid && 'text-fg-muted line-through decoration-fg-subtle/60')}>{v.label}</span>
              {d.groupId && <Badge>grupo</Badge>}
            </span>
            <span className={cn('mt-0.5 block text-xs', st.late ? 'text-neg' : 'text-fg-subtle')}>{st.text}</span>
          </span>
          <span className="flex shrink-0 items-start gap-2">
            <span className="text-right">
              <span className="num block text-base font-semibold tracking-tight">{money(v.paid ? v.paidAmount : v.remaining)}</span>
              <span className="num block text-xs text-fg-subtle">
                {v.paid ? (pay ? 'pago no total' : 'recebido no total') : `falta de ${money(v.total)}`}
              </span>
            </span>
            <ChevronDown aria-hidden="true" className={cn('mt-1 size-4 shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />
          </span>
        </span>
        <span className="mt-3 flex items-center gap-2">
          <span
            role="progressbar"
            aria-label={pay ? 'Quanto já paguei' : 'Quanto já recebi'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(v.progress)}
            className="block h-1 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <span className={cn('block h-full rounded-full', v.paid ? 'bg-pos' : 'bg-accent')} style={{ width: `${v.paid ? 100 : v.progress}%` }} />
          </span>
          {v.paid && <CircleCheck aria-hidden="true" className="size-3.5 shrink-0 text-pos" />}
        </span>
      </button>
      {v.paid && (
        <span className="pointer-events-none absolute top-[11px] -left-[27px] w-[96px] -rotate-45 bg-pos/20 py-0.5 text-center text-[9px] font-semibold tracking-wider text-pos uppercase">
          Quitada
        </span>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-3">
              <p className="text-xs text-fg-muted">{metaLine(v, money, date)}</p>
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
              <div className="mt-3">
                <DebtActions debt={d} paid={v.paid} />
              </div>
            </div>

            <button
              type="button"
              aria-expanded={showInsts}
              aria-controls={listId}
              onClick={() => setShowInsts((o) => !o)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <span>
                Parcelas <span className="num text-fg-subtle">{v.covered}/{v.n} quitadas</span>
              </span>
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', showInsts && 'rotate-180')} />
            </button>
            {showInsts && (
              <div id={listId}>
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

function NotFound({ backHref }: { backHref: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <UserRound aria-hidden="true" className="size-5 text-fg-subtle" />
      <h1 className="mt-3 text-base font-medium">Pessoa não encontrada</h1>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">Não há dívidas com esse nome. Ela pode ter sido renomeada ou excluída no BarnaBank.</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to={backHref}>Voltar para Pessoas</Link>
      </Button>
    </div>
  )
}
