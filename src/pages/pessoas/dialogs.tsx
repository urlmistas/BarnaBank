import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { makeDebtCalc } from '@/lib/finance/debts'
import {
  checkDebtInput, checkPartial, createDebt, debtToInput, editPayment, emptyDebtInput, HIGH_RATE, partialPayment,
  settleDebt, updateDebt, type DebtInput,
} from '@/lib/finance/mutations'
import { firstName } from '@/lib/format'
import { formatMoneyInput, onlyDigits, parseMoney } from '@/lib/money-input'
import { contactKey, replaceDebt, setPhone } from '@/lib/store'
import type { Debt, DebtKind, InterestType, Payment } from '@/lib/types'

// Diálogos de escrita da tela Pessoas. Cada um valida, grava por useWrite (com "Desfazer") e fecha.

function Actions({ onCancel, busyLabel, okLabel, danger }: { onCancel: () => void; busyLabel?: string; okLabel: string; danger?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" className={danger ? 'bg-neg text-white hover:bg-neg/90' : undefined}>
        {busyLabel ?? okLabel}
      </Button>
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

function useWalletOptions(selected: string) {
  const { result, baseSettings } = useAppData()
  const wallets = result?.data.wallets ?? []
  const def = typeof baseSettings.defaultWalletId === 'string' ? baseSettings.defaultWalletId : ''
  const initial = selected || (wallets.some((w) => w.id === def) ? def : '')
  return { wallets, initial, options: [{ value: '', label: '— não afetar carteira —' }, ...wallets.map((w) => ({ value: w.id, label: w.name }))] }
}

// ---------------------------------------------------------------- nova / editar dívida

export function DebtFormDialog({ open, onClose, debt, kind = 'receivable', onSaved }: {
  open: boolean
  onClose: () => void
  debt?: Debt
  kind?: DebtKind
  onSaved?: (debt: Debt) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={debt ? 'Editar dívida' : 'Nova dívida'}>
      <DebtForm debt={debt} kind={kind} onClose={onClose} onSaved={onSaved} />
    </Modal>
  )
}

function DebtForm({ debt, kind, onClose, onSaved }: { debt?: Debt; kind: DebtKind; onClose: () => void; onSaved?: (d: Debt) => void }) {
  const { result, today, baseSettings } = useAppData()
  const write = useWrite()
  const ids = { name: useId(), subject: useId(), principal: useId(), date: useId(), rate: useId(), type: useId(), inst: useId(), due: useId(), fee: useId(), mora: useId(), phone: useId(), pub: useId(), notes: useId(), rec: useId(), recLabel: useId(), list: useId() }
  const contacts = result?.data.contacts ?? {}
  const start = (() => {
    if (debt) return debtToInput(debt, onlyDigits(String(contacts[contactKey(debt.name)]?.phone ?? '')))
    const i = emptyDebtInput(kind, today)
    const rate = Number(baseSettings.defaultRate)
    if (rate > 0) i.rate = rate
    i.lateFeePct = Number(baseSettings.defaultLateFee) || 0
    i.lateInterestPct = Number(baseSettings.defaultLateInterest) || 0
    return i
  })()

  const [k, setK] = useState<DebtKind>(start.kind)
  const [name, setName] = useState(start.name)
  const [subject, setSubject] = useState(start.subject)
  const [principal, setPrincipal] = useState(start.principal ? formatMoneyInput(start.principal) : '')
  const [date, setDate] = useState(start.date)
  const [rate, setRate] = useState(start.rate ? String(start.rate) : '')
  const [itype, setItype] = useState<InterestType>(start.interestType)
  const [inst, setInst] = useState(String(start.installments))
  const [dueDay, setDueDay] = useState(String(start.dueDay))
  const [fee, setFee] = useState(start.lateFeePct ? String(start.lateFeePct) : '')
  const [mora, setMora] = useState(start.lateInterestPct ? String(start.lateInterestPct) : '')
  const [phone, setPhoneText] = useState(start.phone)
  const [pub, setPub] = useState(start.pubNote)
  const [notes, setNotes] = useState(start.notes)
  const [rec, setRec] = useState(start.recurring)
  const [recLabel, setRecLabel] = useState(start.recLabel)
  const [err, setErr] = useState<string | null>(null)
  const [confirmRate, setConfirmRate] = useState(false)

  const pay = k === 'payable'
  const names = [...new Set((result?.data.debts ?? []).map((d) => d.name))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  function build(): DebtInput {
    return {
      kind: k, name, principal: parseMoney(principal), rate: rate.trim() === '' ? 0 : Number(rate.replace(',', '.')), interestType: itype,
      date, installments: inst.trim() === '' ? 1 : Number(inst), dueDay: Number(dueDay), lateFeePct: fee.trim() === '' ? 0 : Number(fee.replace(',', '.')),
      lateInterestPct: mora.trim() === '' ? 0 : Number(mora.replace(',', '.')), notes, subject, pubNote: pub, recurring: rec, recLabel,
      phone: onlyDigits(phone),
    }
  }

  function save(e: FormEvent, skipRateCheck = false) {
    e.preventDefault()
    const input = build()
    const bad = checkDebtInput(input)
    if (bad) return setErr(bad)
    if (!skipRateCheck && input.kind === 'receivable' && input.rate > HIGH_RATE) return setConfirmRate(true)
    setErr(null)
    if (debt) {
      const next = updateDebt(debt, input)
      const ok = write('Dívida atualizada', (api) => {
        replaceDebt(api, debt.id, () => next)
        setPhone(api, input.name, input.phone)
      })
      if (ok) {
        onSaved?.(next)
        onClose()
      }
    } else {
      const created = createDebt(input)
      const ok = write(`Dívida de ${firstName(input.name)} adicionada`, (api) => {
        api.debts.push(created)
        setPhone(api, input.name, input.phone)
      })
      if (ok) {
        onSaved?.(created)
        onClose()
      }
    }
  }

  if (confirmRate) {
    return (
      <form onSubmit={(e) => save(e, true)} className="px-5 py-4">
        <p className="text-sm">
          Uma taxa de <b>{rate.replace('.', ',')}% ao mês</b> é bem acima do comum, e o valor final pode ficar altíssimo. Quer continuar mesmo assim?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmRate(false)}>
            Voltar
          </Button>
          <Button type="submit">Continuar</Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={save} className="px-5 py-4" noValidate>
      {!debt && (
        <div role="group" aria-label="Tipo" className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-border p-1">
          {(['receivable', 'payable'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={k === v}
              onClick={() => setK(v)}
              className={`h-8 cursor-pointer rounded-sm text-sm font-medium transition-colors ${k === v ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg'}`}
            >
              {v === 'receivable' ? 'Me devem' : 'Eu devo'}
            </button>
          ))}
        </div>
      )}

      <Field label={pay ? 'Empresa ou pessoa' : 'Nome do amigo'} htmlFor={ids.name}>
        <Input id={ids.name} list={ids.list} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
        <datalist id={ids.list}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>
      <Field label="Assunto (opcional)" htmlFor={ids.subject} className="mt-3">
        <Input id={ids.subject} value={subject} maxLength={50} onChange={(e) => setSubject(e.target.value)} placeholder="Ex: notebook, conserto da moto" autoComplete="off" />
      </Field>

      {pay && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input id={ids.rec} type="checkbox" checked={rec} onChange={(e) => setRec(e.target.checked)} className="size-4" />
          Assinatura: repete todo mês
        </label>
      )}
      {pay && rec && (
        <Field label="Nome da assinatura" htmlFor={ids.recLabel} className="mt-3">
          <Input id={ids.recLabel} value={recLabel} maxLength={40} onChange={(e) => setRecLabel(e.target.value)} placeholder="Ex: Netflix, Spotify" />
        </Field>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={rec ? 'Valor por mês (R$)' : 'Valor (R$)'} htmlFor={ids.principal}>
          <Input id={ids.principal} inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0,00" autoComplete="off" />
        </Field>
        <Field label={pay ? 'Começou em' : 'Data do empréstimo'} htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      {!pay && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Juros ao mês (%)" htmlFor={ids.rate}>
            <Input id={ids.rate} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0 = sem juros" />
          </Field>
          <Field label="Tipo de juros" htmlFor={ids.type}>
            <Select
              id={ids.type}
              value={itype}
              onChange={setItype}
              options={[
                { value: 'composto', label: 'Compostos' },
                { value: 'simples', label: 'Simples' },
                { value: 'price', label: 'Price' },
              ]}
            />
          </Field>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        {!rec && (
          <Field label="Parcelas" htmlFor={ids.inst}>
            <Input id={ids.inst} type="number" min={1} step={1} value={inst} onChange={(e) => setInst(e.target.value)} />
          </Field>
        )}
        <Field label="Dia do vencimento" htmlFor={ids.due}>
          <Input id={ids.due} type="number" min={1} max={31} step={1} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Multa por atraso (%)" htmlFor={ids.fee}>
          <Input id={ids.fee} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0 = sem multa" />
        </Field>
        <Field label="Juros de mora (% ao mês)" htmlFor={ids.mora}>
          <Input id={ids.mora} inputMode="decimal" value={mora} onChange={(e) => setMora(e.target.value)} placeholder="0 = sem mora" />
        </Field>
      </div>

      {!pay && (
        <Field label="Telefone (opcional)" htmlFor={ids.phone} hint="Com DDD. Usado para cobrar pelo WhatsApp." className="mt-3">
          <Input id={ids.phone} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhoneText(e.target.value)} placeholder="(11) 99999-9999" autoComplete="off" />
        </Field>
      )}
      {!pay && (
        <Field label="Recado para a pessoa (opcional)" htmlFor={ids.pub} hint="Aparece para ela no link de cobrança." className="mt-3">
          <Input id={ids.pub} value={pub} maxLength={140} onChange={(e) => setPub(e.target.value)} />
        </Field>
      )}
      <Field label="Anotações (opcional)" htmlFor={ids.notes} className="mt-3">
        <textarea
          id={ids.notes}
          value={notes}
          maxLength={600}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-border-strong"
        />
      </Field>

      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel={debt ? 'Salvar' : 'Adicionar'} />
    </form>
  )
}

// ---------------------------------------------------------------- pagamento parcial

export function PartialPayDialog({ open, onClose, debt }: { open: boolean; onClose: () => void; debt: Debt }) {
  const pay = debt.kind === 'payable'
  return (
    <Modal open={open} onClose={onClose} title={`${pay ? 'Paguei só uma parte' : 'Recebi só uma parte'} · ${firstName(debt.name)}`}>
      <PartialForm debt={debt} onClose={onClose} />
    </Modal>
  )
}

function PartialForm({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { today, money } = useAppData()
  const write = useWrite()
  const calc = makeDebtCalc(today)
  const s = calc.schedule(debt)
  const rem = calc.remaining(debt)
  const late = s.overdue > 0.005
  const pay = debt.kind === 'payable'
  const w = useWalletOptions('')
  const ids = { amount: useId(), date: useId(), wallet: useId(), note: useId() }
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [wallet, setWallet] = useState(w.initial)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const input = { amount: parseMoney(amount), date, walletId: wallet || undefined, note }
    const bad = checkPartial(debt, today, input)
    if (bad) return setErr(bad.replace('total em aberto', `total em aberto (${money(rem)})`))
    const p = partialPayment(input)
    const left = rem - p.amount
    const ok = write(
      `${pay ? 'Pago' : 'Recebido'} ${money(p.amount)}${pay ? ' a ' : ' de '}${firstName(debt.name)}${left > 0.005 ? ` · faltam ${money(left)}` : ''}`,
      (api) => replaceDebt(api, debt.id, (d) => ({ ...d, payments: [...d.payments, p] })),
      'Pagamento desfeito',
    )
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
        {late ? <>Em atraso: <b className="num text-fg">{money(s.overdue)}</b></> : <>Parcela da vez: <b className="num text-fg">{money(calc.amountDueNow(debt))}</b></>}
        {' · '}total em aberto <span className="num">{money(rem)}</span>. O que faltar continua {late ? 'em atraso' : 'em aberto'}.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={`${pay ? 'Quanto paguei' : 'Quanto recebi'} (R$)`} htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoComplete="off" autoFocus />
        </Field>
        <Field label="Data" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Carteira" htmlFor={ids.wallet} className="mt-3">
        <Select id={ids.wallet} value={wallet} onChange={setWallet} options={w.options} />
      </Field>
      <Field label="Observação (opcional)" htmlFor={ids.note} className="mt-3">
        <Input id={ids.note} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="Ex: o resto paga dia 20" />
      </Field>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel="Registrar" />
    </form>
  )
}

// ---------------------------------------------------------------- quitar com desconto

export function SettleDialog({ open, onClose, debt }: { open: boolean; onClose: () => void; debt: Debt }) {
  return (
    <Modal open={open} onClose={onClose} title={`Quitar com desconto · ${firstName(debt.name)}`}>
      <SettleForm debt={debt} onClose={onClose} />
    </Modal>
  )
}

function SettleForm({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { today, money } = useAppData()
  const write = useWrite()
  const rem = makeDebtCalc(today).remaining(debt)
  const w = useWalletOptions('')
  const ids = { value: useId(), date: useId(), wallet: useId(), note: useId() }
  const [value, setValue] = useState(formatMoneyInput(rem))
  const [date, setDate] = useState(today)
  const [wallet, setWallet] = useState(w.initial)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const v = parseMoney(value)
  const discount = isNaN(v) ? 0 : Math.max(0, rem - v)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (isNaN(v) || v < 0) return setErr('Informe um valor válido.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr('Informe a data.')
    const ok = write(
      discount > 0.005 ? `Dívida quitada com desconto de ${money(discount)}` : 'Dívida quitada',
      (api) => replaceDebt(api, debt.id, (d) => settleDebt(d, today, { value: v, date, walletId: wallet || undefined, note })),
      'Quitação desfeita',
    )
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <p className="text-sm text-fg-muted">
        Em aberto: <b className="num text-fg">{money(rem)}</b>. Digite quanto {debt.kind === 'payable' ? 'você vai pagar' : 'vai receber'} agora. A diferença vira desconto e a dívida é encerrada.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" htmlFor={ids.value}>
          <Input id={ids.value} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="Data" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <p className="num mt-2 text-xs text-fg-muted">Desconto: {money(discount)}</p>
      <Field label="Carteira" htmlFor={ids.wallet} className="mt-3">
        <Select id={ids.wallet} value={wallet} onChange={setWallet} options={w.options} />
      </Field>
      <Field label="Observação (opcional)" htmlFor={ids.note} className="mt-3">
        <Input id={ids.note} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="Quitação com desconto" />
      </Field>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel="Quitar" />
    </form>
  )
}

// ---------------------------------------------------------------- editar pagamento

export function EditPaymentDialog({ open, onClose, debt, index }: { open: boolean; onClose: () => void; debt: Debt; index: number }) {
  return (
    <Modal open={open} onClose={onClose} title="Editar pagamento">
      {debt.payments[index] && <EditPaymentForm debt={debt} payment={debt.payments[index]} index={index} onClose={onClose} />}
    </Modal>
  )
}

function EditPaymentForm({ debt, payment, index, onClose }: { debt: Debt; payment: Payment; index: number; onClose: () => void }) {
  const write = useWrite()
  const w = useWalletOptions(payment.walletId ?? '')
  const ids = { amount: useId(), date: useId(), wallet: useId(), note: useId() }
  const [amount, setAmount] = useState(formatMoneyInput(payment.amount))
  const [date, setDate] = useState(payment.date)
  const [wallet, setWallet] = useState(payment.walletId ?? '')
  const [note, setNote] = useState(payment.note ?? '')
  const [err, setErr] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const v = parseMoney(amount)
    if (!(v > 0)) return setErr('Informe um valor maior que zero.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr('Informe a data do pagamento.')
    const ok = write(
      'Pagamento atualizado',
      (api) => replaceDebt(api, debt.id, (d) => editPayment(d, index, { amount: v, date, walletId: wallet || undefined, note })),
    )
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="Data" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Carteira" htmlFor={ids.wallet} className="mt-3">
        <Select id={ids.wallet} value={wallet} onChange={setWallet} options={w.options} />
      </Field>
      <Field label="Observação (opcional)" htmlFor={ids.note} className="mt-3">
        <Input id={ids.note} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel="Salvar" />
    </form>
  )
}

// ---------------------------------------------------------------- confirmações

export function ConfirmDialog({ open, onClose, title, children, okLabel, onOk, danger = true }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  okLabel: string
  onOk: () => void
  danger?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          onOk()
          onClose()
        }}
      >
        <div className="text-sm text-fg-muted">{children}</div>
        <Actions onCancel={onClose} okLabel={okLabel} danger={danger} />
      </form>
    </Modal>
  )
}
