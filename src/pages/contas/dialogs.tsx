import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import {
  billToInput, cardToInput, checkBillInput, checkBillPay, checkCardInput, checkInvoicePay, checkPurchaseInput, createBill, createCard,
  createPurchase, emptyBillInput, emptyCardInput, emptyPurchaseInput, markBillPaid, payInvoice, updateBill, updateCard,
} from '@/lib/finance/contas-mutations'
import { invoiceKeyFor } from '@/lib/finance/bills-cards'
import { dayIn, ymAdd } from '@/lib/finance/dates'
import { formatMoneyInput, parseMoney } from '@/lib/money-input'
import { replaceBill, replaceCard } from './store-helpers'
import { monthTitle } from './text'
import type { Bill, Card, YearMonth } from '@/lib/types'

// Diálogos de escrita da tela Contas. Cada um valida, grava por useWrite (com "Desfazer") e fecha.

function Actions({ onCancel, okLabel }: { onCancel: () => void; okLabel: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit">{okLabel}</Button>
    </div>
  )
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-xs text-neg">
      {children}
    </p>
  )
}

/** carteiras para escolher; `empty` é o texto da opção sem carteira ("nenhuma", "escolher na hora"…) */
function useWallets(selected: string, empty: string) {
  const { result, baseSettings } = useAppData()
  const wallets = result?.data.wallets ?? []
  const def = typeof baseSettings.defaultWalletId === 'string' ? baseSettings.defaultWalletId : ''
  const initial = selected || (wallets.some((w) => w.id === def) ? def : '')
  return { initial, options: [{ value: '', label: empty }, ...wallets.map((w) => ({ value: w.id, label: w.name }))] }
}

// ---------------------------------------------------------------- conta fixa: nova / editar

export function BillFormDialog({ open, onClose, bill, month }: { open: boolean; onClose: () => void; bill?: Bill; month: YearMonth }) {
  return (
    <Modal open={open} onClose={onClose} title={bill ? 'Editar conta fixa' : 'Nova conta fixa'}>
      <BillForm bill={bill} month={month} onClose={onClose} />
    </Modal>
  )
}

function BillForm({ bill, month, onClose }: { bill?: Bill; month: YearMonth; onClose: () => void }) {
  const { result, today } = useAppData()
  const write = useWrite()
  const ids = { kind: useId(), name: useId(), amount: useId(), day: useId(), cat: useId(), cats: useId(), wallet: useId(), start: useId() }
  const w = useWallets(bill?.walletId ?? '', '— nenhuma —')
  const start = bill ? billToInput(bill) : emptyBillInput(month, today, w.initial)
  const [kind, setKind] = useState(start.kind)
  const [name, setName] = useState(start.name)
  const [amount, setAmount] = useState(start.amount ? formatMoneyInput(start.amount) : '')
  const [day, setDay] = useState(String(start.dueDay))
  const [category, setCategory] = useState(start.category)
  const [wallet, setWallet] = useState(start.walletId)
  const [startMonth, setStartMonth] = useState(start.startMonth)
  const [err, setErr] = useState<string | null>(null)

  const cats = [...new Set((result?.data.transactions ?? []).filter((t) => t.category && t.type !== 'transferencia').map((t) => t.category as string))]

  function submit(e: FormEvent) {
    e.preventDefault()
    const input = { kind, name, amount: parseMoney(amount), dueDay: Number(day), category, walletId: wallet, startMonth }
    const bad = checkBillInput(input)
    if (bad) return setErr(bad)
    setErr(null)
    const ok = bill
      ? write('Conta fixa atualizada', (api) => replaceBill(api, bill.id, (b) => updateBill(b, input, month)))
      : write('Conta fixa criada', (api) => {
          api.bills.push(createBill(input, month))
        })
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <Field label="Tipo" htmlFor={ids.kind}>
        <Select
          id={ids.kind}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'gasto', label: 'Conta a pagar (aluguel, internet, assinatura…)' },
            { value: 'entrada', label: 'Receita que entra todo mês (salário…)' },
          ]}
        />
      </Field>
      <Field label="Nome" htmlFor={ids.name} className="mt-3">
        <Input id={ids.name} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="Ex: Internet, Aluguel, Netflix" autoComplete="off" autoFocus />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoComplete="off" />
        </Field>
        <Field label="Dia do vencimento" htmlFor={ids.day}>
          <Input id={ids.day} type="number" min={1} max={31} step={1} value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Categoria" htmlFor={ids.cat}>
          <Input id={ids.cat} list={ids.cats} value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Moradia" autoComplete="off" />
          <datalist id={ids.cats}>
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Carteira" htmlFor={ids.wallet}>
          <Select id={ids.wallet} value={wallet || w.initial} onChange={setWallet} options={w.options} />
        </Field>
      </div>
      <Field label="Começa em" htmlFor={ids.start} className="mt-3">
        <Input id={ids.start} type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
      </Field>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel={bill ? 'Salvar' : 'Criar'} />
    </form>
  )
}

// ---------------------------------------------------------------- conta fixa: marcar como paga

export function PayBillDialog({ open, onClose, bill, month }: { open: boolean; onClose: () => void; bill: Bill; month: YearMonth }) {
  const isIn = bill.kind === 'entrada'
  return (
    <Modal open={open} onClose={onClose} title={`${isIn ? 'Receber' : 'Pagar'}: ${bill.name}`}>
      <PayBillForm bill={bill} month={month} onClose={onClose} />
    </Modal>
  )
}

function PayBillForm({ bill, month, onClose }: { bill: Bill; month: YearMonth; onClose: () => void }) {
  const { today, date, money } = useAppData()
  const write = useWrite()
  const isIn = bill.kind === 'entrada'
  const ids = { amount: useId(), date: useId(), wallet: useId() }
  const w = useWallets(bill.walletId ?? '', '— não afetar carteira —')
  const [amount, setAmount] = useState(formatMoneyInput(bill.amount))
  const [when, setWhen] = useState(today)
  const [wallet, setWallet] = useState(w.initial)
  const [err, setErr] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const input = { amount: parseMoney(amount), date: when, walletId: wallet }
    const bad = checkBillPay(input)
    if (bad) return setErr(bad)
    const ok = write(
      `${bill.name} ${isIn ? 'recebida' : 'paga'} · ${money(input.amount)}`,
      (api) => void markBillPaid(api, bill.id, month, input),
      'Marcação desfeita',
    )
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted first-letter:uppercase">
        {monthTitle(month)} · vence <span className="num">{date(dayIn(month, bill.dueDay))}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="Data" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
      <Field label="Carteira" htmlFor={ids.wallet} className="mt-3">
        <Select id={ids.wallet} value={wallet} onChange={setWallet} options={w.options} />
      </Field>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel={isIn ? 'Marcar como recebida' : 'Marcar como paga'} />
    </form>
  )
}

// ---------------------------------------------------------------- cartão: novo / editar

export function CardFormDialog({ open, onClose, card }: { open: boolean; onClose: () => void; card?: Card }) {
  return (
    <Modal open={open} onClose={onClose} title={card ? 'Editar cartão' : 'Novo cartão de crédito'}>
      <CardForm card={card} onClose={onClose} />
    </Modal>
  )
}

function CardForm({ card, onClose }: { card?: Card; onClose: () => void }) {
  const write = useWrite()
  const ids = { name: useId(), limit: useId(), close: useId(), due: useId(), wallet: useId() }
  const w = useWallets(card?.walletId ?? '', '— escolher na hora —')
  const start = card ? cardToInput(card) : emptyCardInput(w.initial)
  const [name, setName] = useState(start.name)
  const [limit, setLimit] = useState(start.limit ? formatMoneyInput(start.limit) : '')
  const [closing, setClosing] = useState(String(start.closingDay))
  const [due, setDue] = useState(String(start.dueDay))
  const [wallet, setWallet] = useState(start.walletId)
  const [err, setErr] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const lim = parseMoney(limit)
    const input = { name, limit: isNaN(lim) ? 0 : lim, closingDay: Number(closing), dueDay: Number(due), walletId: wallet }
    const bad = checkCardInput(input)
    if (bad) return setErr(bad)
    setErr(null)
    const ok = card
      ? write('Cartão atualizado', (api) => replaceCard(api, card.id, (c) => updateCard(c, input)))
      : write('Cartão criado', (api) => {
          api.cards.push(createCard(input))
        })
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <Field label="Nome do cartão" htmlFor={ids.name}>
        <Input id={ids.name} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank, Inter Gold" autoComplete="off" autoFocus />
      </Field>
      <Field label="Limite (R$)" htmlFor={ids.limit} className="mt-3">
        <Input id={ids.limit} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0,00" autoComplete="off" />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Dia que a fatura fecha" htmlFor={ids.close}>
          <Input id={ids.close} type="number" min={1} max={31} value={closing} onChange={(e) => setClosing(e.target.value)} />
        </Field>
        <Field label="Dia do vencimento" htmlFor={ids.due}>
          <Input id={ids.due} type="number" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <Field label="Pagar a fatura com" htmlFor={ids.wallet} className="mt-3">
        <Select id={ids.wallet} value={wallet} onChange={setWallet} options={w.options} />
      </Field>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel={card ? 'Salvar' : 'Criar cartão'} />
    </form>
  )
}

// ---------------------------------------------------------------- compra no cartão

export function PurchaseDialog({ open, onClose, card }: { open: boolean; onClose: () => void; card: Card }) {
  return (
    <Modal open={open} onClose={onClose} title={`Compra no ${card.name}`}>
      <PurchaseForm card={card} onClose={onClose} />
    </Modal>
  )
}

function PurchaseForm({ card, onClose }: { card: Card; onClose: () => void }) {
  const { result, today, money } = useAppData()
  const write = useWrite()
  const ids = { desc: useId(), amount: useId(), n: useId(), date: useId(), cat: useId(), cats: useId() }
  const start = emptyPurchaseInput(today)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [n, setN] = useState('1')
  const [when, setWhen] = useState(start.date)
  const [category, setCategory] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const data = result?.data
  const cats = [
    ...new Set([
      ...(data?.cardPurchases ?? []).map((p) => p.category),
      ...(data?.transactions ?? []).filter((t) => t.type === 'gasto').map((t) => t.category),
    ].filter((c): c is string => !!c)),
  ]

  // "Entra na fatura de …"
  const count = Math.max(1, Math.floor(Number(n)) || 1)
  const value = parseMoney(amount)
  const first = /^\d{4}-\d{2}-\d{2}$/.test(when) ? invoiceKeyFor(card, when) : null
  const hint = first
    ? `Entra na fatura de ${monthTitle(first)}` +
      (count > 1 ? ` (${count}x${value > 0 ? ' de ' + money(value / count) : ''}, até ${monthTitle(ymAdd(first, count - 1))})` : '') +
      '.'
    : ''

  function submit(e: FormEvent) {
    e.preventDefault()
    const input = { desc, amount: parseMoney(amount), installments: n.trim() === '' ? 1 : Number(n), date: when, category }
    const bad = checkPurchaseInput(input)
    if (bad) return setErr(bad)
    setErr(null)
    const ok = write('Compra adicionada', (api) => {
      api.cardPurchases.push(createPurchase(card.id, input))
    })
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <Field label="Descrição" htmlFor={ids.desc}>
        <Input id={ids.desc} value={desc} maxLength={50} onChange={(e) => setDesc(e.target.value)} placeholder="Ex: Tênis, Mercado, iFood" autoComplete="off" autoFocus />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor total (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoComplete="off" />
        </Field>
        <Field label="Parcelas" htmlFor={ids.n}>
          <Input id={ids.n} type="number" min={1} max={48} value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Data da compra" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Categoria" htmlFor={ids.cat}>
          <Input id={ids.cat} list={ids.cats} value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Roupas" autoComplete="off" />
          <datalist id={ids.cats}>
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>
      <p className="mt-3 text-xs text-fg-muted first-letter:uppercase">{hint}</p>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel="Adicionar compra" />
    </form>
  )
}

// ---------------------------------------------------------------- pagar fatura

export function PayInvoiceDialog({ open, onClose, card, invoiceKey, balance, due }: {
  open: boolean
  onClose: () => void
  card: Card
  invoiceKey: YearMonth
  balance: number
  due: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={`Pagar fatura · ${card.name}`}>
      <PayInvoiceForm card={card} invoiceKey={invoiceKey} balance={balance} due={due} onClose={onClose} />
    </Modal>
  )
}

function PayInvoiceForm({ card, invoiceKey, balance, due, onClose }: { card: Card; invoiceKey: YearMonth; balance: number; due: string; onClose: () => void }) {
  const { today, date, money } = useAppData()
  const write = useWrite()
  const open = Math.max(0, balance)
  const ids = { amount: useId(), date: useId(), wallet: useId() }
  const w = useWallets(card.walletId ?? '', '— não afetar carteira —')
  const [amount, setAmount] = useState(formatMoneyInput(open))
  const [when, setWhen] = useState(today)
  const [wallet, setWallet] = useState(w.initial)
  const [err, setErr] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const input = { amount: parseMoney(amount), date: when, walletId: wallet }
    const bad = checkInvoicePay(input)
    if (bad) return setErr(bad)
    const ok = write(
      `Fatura ${card.name}: pago ${money(input.amount)}`,
      (api) => void payInvoice(api, card, invoiceKey, input),
      'Pagamento da fatura desfeito',
    )
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
        Fatura de {monthTitle(invoiceKey)} · vence <span className="num">{date(due)}</span> · em aberto <b className="num text-fg">{money(open)}</b>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor pago (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="Data" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
      <Field label="Carteira" htmlFor={ids.wallet} className="mt-3">
        <Select id={ids.wallet} value={wallet} onChange={setWallet} options={w.options} />
      </Field>
      <p className="mt-3 text-xs text-fg-subtle">Pagou só uma parte? Sem problema: o que faltar vai para a próxima fatura depois do vencimento.</p>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel="Registrar pagamento" />
    </form>
  )
}
