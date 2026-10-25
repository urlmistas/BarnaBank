import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, Check, CreditCard, HandCoins, Receipt, Repeat, BanknoteArrowUp, type LucideIcon } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { calendarGrid, calendarTotals, defaultDay, monthEvents, type MonthEvent } from '@/lib/finance/calendar'
import { quickPayment } from '@/lib/finance/mutations'
import { firstName, MONTHS } from '@/lib/format'
import { replaceDebt } from '@/lib/store'
import type { AppData, ISODate, YearMonth } from '@/lib/types'
import { cn } from '@/lib/utils'
import { PayBillDialog, PayInvoiceDialog } from './dialogs'

// Calendário do mês: parcelas, contas fixas, faturas e recorrentes. Clicar num dia mostra o que acontece nele.

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function iconOf(e: MonthEvent): LucideIcon {
  if (e.done) return Check
  if (e.kind === 'debt') return e.dir === 'out' ? BanknoteArrowUp : HandCoins
  if (e.kind === 'bill') return e.dir === 'in' ? ArrowDownLeft : Receipt
  if (e.kind === 'card') return CreditCard
  return Repeat
}

export function CalendarView({ data, month }: { data: AppData; month: YearMonth }) {
  const { today } = useAppData()
  // o dia escolhido recomeça sozinho ao trocar de mês
  return <CalendarMonth key={month} data={data} month={month} today={today} />
}

function CalendarMonth({ data, month, today }: { data: AppData; month: YearMonth; today: ISODate }) {
  const { money, canEdit, baseSettings } = useAppData()
  const write = useWrite()
  const events = useMemo(() => monthEvents(data, month, today), [data, month, today])
  const grid = useMemo(() => calendarGrid(month, events), [month, events])
  const totals = useMemo(() => calendarTotals(events), [events])
  const [picked, setPicked] = useState<ISODate | null>(null)
  const sel = picked ?? defaultDay(month, events, today)
  const [act, setAct] = useState<MonthEvent | null>(null)
  const list = events.filter((e) => e.date === sel)
  const d = new Date(sel + 'T00:00:00')
  const bill = act?.billId ? data.bills.find((b) => b.id === act.billId) : undefined
  const card = act?.cardId ? data.cards.find((c) => c.id === act.cardId) : undefined

  function quick(e: MonthEvent) {
    const debt = data.debts.find((x) => x.id === e.debtId)
    if (!debt) return
    const def = typeof baseSettings.defaultWalletId === 'string' ? baseSettings.defaultWalletId : ''
    const p = quickPayment(debt, today, def || undefined)
    if (!p) return
    write(
      `${debt.kind === 'payable' ? 'Pago' : 'Recebido'} ${money(p.amount)}${debt.kind === 'payable' ? ' a ' : ' de '}${firstName(debt.name)}`,
      (api) => replaceDebt(api, debt.id, (x) => ({ ...x, payments: [...x.payments, p] })),
      'Pagamento desfeito',
    )
  }

  function actionOf(e: MonthEvent): { label: string; run: () => void } | null {
    if (!canEdit || e.done) return null
    if (e.kind === 'debt' && e.nextOpen) return { label: e.dir === 'out' ? 'Paguei' : 'Recebi', run: () => quick(e) }
    if (e.kind === 'bill') return { label: e.dir === 'in' ? 'Recebi' : 'Paguei', run: () => setAct(e) }
    if (e.kind === 'card' && (e.balance ?? 0) > 0) return { label: 'Pagar', run: () => setAct(e) }
    return null
  }

  return (
    <section aria-label="Calendário" className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-sm font-medium">Calendário</h2>
        <p className="num text-xs text-fg-muted">
          {totals.in > 0 && <span className="text-pos">entra {money(totals.in)}</span>}
          {totals.in > 0 && totals.out > 0 && ' · '}
          {totals.out > 0 && <>sai {money(totals.out)}</>}
          {totals.in <= 0 && totals.out <= 0 && 'nada em aberto neste mês'}
        </p>
      </div>

      <div className="px-3 py-3 sm:px-5">
        <div role="grid" aria-label="Dias do mês" className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w, i) => (
            <span key={i} role="columnheader" className="pb-1 text-center text-xs text-fg-subtle">
              {w}
            </span>
          ))}
          {grid.map((g, i) =>
            g.day === 0 ? (
              <span key={'x' + i} />
            ) : (
              <button
                key={g.iso}
                type="button"
                role="gridcell"
                aria-selected={g.iso === sel}
                aria-label={`${g.day} de ${MONTHS[+month.slice(5, 7) - 1]}${g.events.length ? `, ${g.events.length} ${g.events.length === 1 ? 'item' : 'itens'}` : ''}`}
                onClick={() => setPicked(g.iso)}
                className={cn(
                  'flex h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border text-sm transition-colors',
                  g.iso === sel ? 'border-border-strong bg-surface-2' : 'border-transparent hover:bg-surface-2',
                  g.iso === today && 'font-semibold text-accent-text',
                  g.iso < today && !g.events.length && 'text-fg-subtle',
                )}
              >
                <span className="num">{g.day}</span>
                <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                  {g.hasIn && <i className="size-1.5 rounded-full bg-pos" />}
                  {g.hasOut && <i className={cn('size-1.5 rounded-full', g.hasLate ? 'bg-neg' : 'bg-fg-muted')} />}
                  {g.allDone && <i className="size-1.5 rounded-full border border-fg-subtle" />}
                </span>
              </button>
            ),
          )}
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
          <span><i className="mr-1 inline-block size-1.5 rounded-full bg-pos align-middle" />entra</span>
          <span><i className="mr-1 inline-block size-1.5 rounded-full bg-fg-muted align-middle" />sai</span>
          <span><i className="mr-1 inline-block size-1.5 rounded-full bg-neg align-middle" />atrasado</span>
          <span><i className="mr-1 inline-block size-1.5 rounded-full border border-fg-subtle align-middle" />resolvido</span>
        </p>
      </div>

      <h3 className="border-t border-border px-4 py-2.5 text-sm font-medium first-letter:uppercase sm:px-5">
        {WEEKDAY_NAMES[d.getDay()]}, {d.getDate()} de {MONTHS[d.getMonth()]}
      </h3>
      {!list.length ? (
        <p className="border-t border-border px-4 py-5 text-sm text-fg-muted sm:px-5">Nada neste dia.</p>
      ) : (
        <ul aria-label="Itens do dia" className="border-t border-border">
          {list.map((e) => {
            const Icon = iconOf(e)
            const a = actionOf(e)
            return (
              <li key={e.key} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 sm:px-5">
                <Icon aria-hidden="true" className={cn('size-4 shrink-0', e.late ? 'text-neg' : 'text-fg-muted')} />
                <Link to={e.to} className="min-w-0 flex-1 rounded-sm">
                  <span className="block truncate text-sm">{e.title}</span>
                  <span className={cn('block truncate text-xs', e.late ? 'text-neg' : 'text-fg-subtle')}>{e.sub}</span>
                </Link>
                <span className={cn('num text-sm', e.done ? 'text-fg-muted' : e.dir === 'in' ? 'text-pos' : 'text-fg')}>
                  {e.dir === 'out' ? '−' : '+'}
                  {money(e.amount)}
                </span>
                {a && (
                  <Button size="sm" variant="outline" onClick={a.run}>
                    <Check aria-hidden="true" />
                    {a.label}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {bill && act && <PayBillDialog open onClose={() => setAct(null)} bill={bill} month={month} />}
      {card && act?.invoiceKey && act.due && (
        <PayInvoiceDialog open onClose={() => setAct(null)} card={card} invoiceKey={act.invoiceKey} balance={act.balance ?? 0} due={act.due} />
      )}
    </section>
  )
}
