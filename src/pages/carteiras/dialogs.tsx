import { useId, useState, type FormEvent } from 'react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { checkTx, checkWallet, createTx, createWallet, emptyTxInput, findTxIndex, txToInput, updateTx, updateWallet, usedCategories, type TxInput } from '@/lib/finance/wallet-mutations'
import { getRecurring, setRecurring } from '@/lib/finance/plan-store'
import { recurringFromTx } from '@/lib/finance/recurring'
import { formatMoneyInput, parseMoney } from '@/lib/money-input'
import { walletIconKey } from '@/lib/storage'
import type { Transaction, TransactionType, Wallet } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ICON_KEYS, iconLabel } from './icon-keys'
import { WalletIcon } from './wallet-icon'

// Diálogos de escrita de Carteiras. Cada um valida, grava por useWrite (com "Desfazer") e fecha.

function Buttons({ onCancel, okLabel }: { onCancel: () => void; okLabel: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit">{okLabel}</Button>
    </div>
  )
}

function ErrorLine({ children }: { children: string | null }) {
  return (
    <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-xs text-neg">
      {children}
    </p>
  )
}

// ---------------------------------------------------------------- carteira

export function WalletFormDialog({ open, onClose, wallet, onSaved }: { open: boolean; onClose: () => void; wallet?: Wallet; onSaved?: (w: Wallet) => void }) {
  return (
    <Modal open={open} onClose={onClose} title={wallet ? 'Editar carteira' : 'Nova carteira'}>
      <WalletForm wallet={wallet} onClose={onClose} onSaved={onSaved} />
    </Modal>
  )
}

function WalletForm({ wallet, onClose, onSaved }: { wallet?: Wallet; onClose: () => void; onSaved?: (w: Wallet) => void }) {
  const write = useWrite()
  const nameId = useId()
  const [name, setName] = useState(wallet?.name ?? '')
  const current = wallet ? walletIconKey(wallet.icon) : 'wallet'
  const [icon, setIcon] = useState(current)
  const [err, setErr] = useState<string | null>(null)
  // emoji antigo continua disponível, como no app antigo
  const options = ICON_KEYS.includes(current) ? ICON_KEYS : [current, ...ICON_KEYS]

  function submit(e: FormEvent) {
    e.preventDefault()
    const bad = checkWallet(name)
    if (bad) return setErr(bad)
    if (wallet) {
      const next = updateWallet(wallet, name, icon)
      const ok = write('Carteira atualizada', (api) => {
        api.wallets = api.wallets.map((w) => (w.id === wallet.id ? { ...w, name: next.name, icon: next.icon } : w))
      })
      if (ok) {
        onSaved?.(next)
        onClose()
      }
    } else {
      const created = createWallet(name, icon)
      const ok = write('Carteira criada', (api) => {
        api.wallets.push(created)
      })
      if (ok) {
        onSaved?.(created)
        onClose()
      }
    }
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <Field label="Nome" htmlFor={nameId}>
        <Input id={nameId} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank, Dinheiro, Poupança" autoComplete="off" autoFocus />
      </Field>
      <div className="mt-3">
        <p id={`${nameId}-icon`} className="text-xs font-medium text-fg-muted">
          Ícone
        </p>
        <div role="radiogroup" aria-labelledby={`${nameId}-icon`} className="mt-1 grid grid-cols-8 gap-1">
          {options.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={k === icon}
              aria-label={iconLabel(k)}
              title={iconLabel(k)}
              onClick={() => setIcon(k)}
              className={cn(
                'grid h-9 cursor-pointer place-items-center rounded-sm border text-fg-muted transition-colors hover:text-fg',
                k === icon ? 'border-accent bg-surface-2 text-fg' : 'border-border',
              )}
            >
              <WalletIcon icon={k} />
            </button>
          ))}
        </div>
      </div>
      <ErrorLine>{err}</ErrorLine>
      <Buttons onCancel={onClose} okLabel={wallet ? 'Salvar' : 'Criar'} />
    </form>
  )
}

// ---------------------------------------------------------------- lançamento

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'gasto', label: 'Gasto' },
  { value: 'transferencia', label: 'Transferência' },
]

/** `txId` = id do lançamento a editar (ou "i<posição>" nos antigos sem id); sem ele, cria um novo */
export function TxFormDialog({ open, onClose, txId, walletId }: { open: boolean; onClose: () => void; txId?: string; walletId?: string }) {
  return (
    <Modal open={open} onClose={onClose} title={txId ? 'Editar lançamento' : 'Novo lançamento'}>
      <TxForm txId={txId} walletId={walletId} onClose={onClose} />
    </Modal>
  )
}

function TxForm({ txId, walletId, onClose }: { txId?: string; walletId?: string; onClose: () => void }) {
  const { result, today, money } = useAppData()
  const write = useWrite()
  const data = result?.data
  const wallets = data?.wallets ?? []
  const txIdx = txId && data ? findTxIndex(data.transactions, txId) : -1
  const tx: Transaction | undefined = txIdx >= 0 ? data?.transactions[txIdx] : undefined
  const ids = { wallet: useId(), to: useId(), amount: useId(), date: useId(), cat: useId(), note: useId(), list: useId() }
  const start: TxInput = tx ? txToInput(tx) : emptyTxInput(today, walletId && wallets.some((w) => w.id === walletId) ? walletId : (wallets[0]?.id ?? ''))
  const [type, setType] = useState<TransactionType>(start.type)
  const [from, setFrom] = useState(start.walletId)
  const [to, setTo] = useState(start.toWalletId)
  const [amount, setAmount] = useState(start.amount ? formatMoneyInput(start.amount) : '')
  const [date, setDate] = useState(start.date)
  const [category, setCategory] = useState(start.category)
  const [note, setNote] = useState(start.note)
  const [repeat, setRepeat] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const transfer = type === 'transferencia'
  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }))
  // transferência: destino padrão = a primeira carteira diferente da origem
  const toValue = to && to !== from ? to : (wallets.find((w) => w.id !== from)?.id ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    const input: TxInput = { type, walletId: from, toWalletId: transfer ? toValue : '', amount: parseMoney(amount), date, category, note }
    const bad = checkTx(input, wallets.map((w) => w.id))
    if (bad) return setErr(bad)
    const name = (id: string) => wallets.find((w) => w.id === id)?.name ?? ''
    if (txId) {
      if (!tx) return setErr('Este lançamento não existe mais.')
      const ok = write(
        'Lançamento atualizado',
        (api) => {
          const idx = findTxIndex(api.transactions, txId ?? '')
          if (idx >= 0) api.transactions = api.transactions.map((t, i) => (i === idx ? updateTx(t, input) : t))
        },
        'Alteração desfeita',
      )
      if (ok) onClose()
      return
    }
    const created = createTx(input)
    const v = created.amount
    const msg = transfer
      ? `Transferido ${money(v)} de ${name(from)} para ${name(input.toWalletId)}`
      : type === 'gasto'
        ? `Gasto de ${money(v)} registrado`
        : `Entrada de ${money(v)} registrada`
    // "Repetir todo mês": cria o recorrente já com este mês marcado como feito (só entrada e gasto)
    const rec = repeat && !transfer ? recurringFromTx(created) : null
    const ok = write(rec ? `${msg} · repete todo mês` : msg, (api) => {
      if (rec) {
        setRecurring(api, [...getRecurring(api), rec.rec])
        api.transactions.push(rec.tx)
      } else api.transactions.push(created)
    }, 'Lançamento desfeito')
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <div role="group" aria-label="Tipo" className="mb-4 grid grid-cols-3 gap-1 rounded-md border border-border p-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={type === t.value}
            onClick={() => setType(t.value)}
            className={cn(
              'h-8 cursor-pointer rounded-sm text-sm font-medium transition-colors',
              type === t.value ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Field label={transfer ? 'De' : 'Carteira'} htmlFor={ids.wallet}>
        <Select id={ids.wallet} value={from} onChange={setFrom} options={walletOptions} />
      </Field>
      {transfer && (
        <Field label="Para" htmlFor={ids.to} className="mt-3">
          <Select id={ids.to} value={toValue} onChange={setTo} options={walletOptions} />
        </Field>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoComplete="off" autoFocus />
        </Field>
        <Field label="Data" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      {!transfer && (
        <Field label="Categoria" htmlFor={ids.cat} className="mt-3">
          <Input id={ids.cat} list={ids.list} value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Mercado, Salário" autoComplete="off" />
          <datalist id={ids.list}>
            {usedCategories(data?.transactions ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      )}
      <Field label="Observação (opcional)" htmlFor={ids.note} className="mt-3">
        <Input id={ids.note} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {!transfer && !txId && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="size-4" />
          Repetir todo mês, no mesmo dia
        </label>
      )}

      <ErrorLine>{err}</ErrorLine>
      <Buttons onCancel={onClose} okLabel={tx ? 'Salvar alterações' : 'Salvar lançamento'} />
    </form>
  )
}
