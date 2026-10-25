import { useId, useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { buildBudgets, knownExpenseCats } from '@/lib/finance/budgets'
import { checkGoal, checkMove, createGoal, goalInfo, goalToInput, moveGoal, updateGoal, type GoalInput } from '@/lib/finance/goals'
import { getGoals, getRecurring, postRecurring, replaceGoal, replaceRecurring, setBudgets, setGoals, setRecurring } from '@/lib/finance/plan-store'
import {
  checkRecurring, createRecurring, emptyRecurringInput, recurringToInput, updateRecurring, type RecurringInput,
} from '@/lib/finance/recurring'
import { normTxt } from '@/lib/finance/people'
import { monthSpending } from '@/lib/finance/reports'
import { formatMoneyInput, parseMoney } from '@/lib/money-input'
import type { Goal, Recurring } from '@/lib/types'

// Diálogos de escrita de orçamento, metas e recorrentes. Cada um valida, grava por useWrite (com "Desfazer") e fecha.

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

// ---------------------------------------------------------------- orçamento

export function BudgetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Orçamento do mês">
      <BudgetForm onClose={onClose} />
    </Modal>
  )
}

function BudgetForm({ onClose }: { onClose: () => void }) {
  const { result, today, money } = useAppData()
  const write = useWrite()
  const data = result?.data
  const cats = data ? knownExpenseCats(data) : []
  const budgets = data?.budgets ?? {}
  const spending = data ? monthSpending(data, today.slice(0, 7)) : null
  const spentBy = (c: string) => spending?.byCat[normTxt(c)]?.amount ?? 0
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(cats.map((c) => [c, budgets[c] ? formatMoneyInput(budgets[c]) : ''])))
  const [newName, setNewName] = useState('')
  const [newVal, setNewVal] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const idBase = useId()

  function submit(e: FormEvent) {
    e.preventDefault()
    const out = buildBudgets({
      limits: cats.map((c) => ({ name: c, limit: parseMoney(vals[c] ?? '') })),
      newName,
      newLimit: parseMoney(newVal),
    })
    if ('error' in out) return setErr(out.error)
    const ok = write('Orçamento salvo', (api) => setBudgets(api, out.budgets), 'Orçamento restaurado')
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <p className="text-sm text-fg-muted">Quanto você quer gastar, no máximo, por mês em cada categoria. Deixe vazio para não limitar.</p>
      {cats.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {cats.map((c, i) => (
            <li key={c} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 px-3 py-2">
              <label htmlFor={`${idBase}-${i}`} className="min-w-0 text-sm">
                <span className="block truncate">{c}</span>
                <span className="num block text-xs text-fg-subtle">{spentBy(c) > 0 ? `${money(spentBy(c))} este mês` : 'nada este mês'}</span>
              </label>
              <Input
                id={`${idBase}-${i}`}
                inputMode="decimal"
                value={vals[c] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [c]: e.target.value }))}
                placeholder="sem limite"
                autoComplete="off"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_120px] gap-3">
        <Field label="Outra categoria" htmlFor={`${idBase}-new`}>
          <Input id={`${idBase}-new`} value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Mercado" autoComplete="off" />
        </Field>
        <Field label="Limite (R$)" htmlFor={`${idBase}-newv`}>
          <Input id={`${idBase}-newv`} inputMode="decimal" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="0,00" autoComplete="off" />
        </Field>
      </div>
      <ErrorLine>{err}</ErrorLine>
      <Buttons onCancel={onClose} okLabel="Salvar orçamento" />
    </form>
  )
}

// ---------------------------------------------------------------- metas

export function GoalDialog({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal }) {
  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Editar meta' : 'Nova meta'}>
      <GoalForm goal={goal} onClose={onClose} />
    </Modal>
  )
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { result, today } = useAppData()
  const write = useWrite()
  const wallets = result?.data.wallets ?? []
  const start: GoalInput = goal ? goalToInput(goal) : { name: '', target: 0, deadline: '', walletId: '', start: 0 }
  const ids = { name: useId(), target: useId(), deadline: useId(), wallet: useId(), start: useId() }
  const [name, setName] = useState(start.name)
  const [target, setTarget] = useState(start.target ? formatMoneyInput(start.target) : '')
  const [deadline, setDeadline] = useState<string>(start.deadline)
  const [walletId, setWalletId] = useState(start.walletId)
  const [startVal, setStartVal] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const input = (): GoalInput => ({ name, target: parseMoney(target), deadline: deadline as GoalInput['deadline'], walletId, start: parseMoney(startVal) })

  function submit(e: FormEvent) {
    e.preventDefault()
    const i = input()
    const bad = checkGoal(i)
    if (bad) return setErr(bad)
    const ok = goal
      ? write('Meta atualizada', (api) => replaceGoal(api, goal.id, (g) => updateGoal(g, i)), 'Alteração desfeita')
      : write('Meta criada', (api) => setGoals(api, [...getGoals(api), createGoal(i, today)]), 'Meta desfeita')
    if (ok) onClose()
  }

  function remove() {
    if (!goal) return
    const ok = write(`Meta "${goal.name}" excluída`, (api) => setGoals(api, getGoals(api).filter((g) => g.id !== goal.id)), 'Meta restaurada')
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <Field label="Nome da meta" htmlFor={ids.name}>
        <Input id={ids.name} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Ex: Viagem, Reserva, PS5" autoComplete="off" autoFocus />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Quanto quer juntar (R$)" htmlFor={ids.target}>
          <Input id={ids.target} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" autoComplete="off" />
        </Field>
        <Field label="Até quando (opcional)" htmlFor={ids.deadline}>
          <Input id={ids.deadline} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
      <Field label="Como acompanhar" htmlFor={ids.wallet} className="mt-3">
        <Select
          id={ids.wallet}
          value={walletId}
          onChange={setWalletId}
          options={[{ value: '', label: 'Valores que eu guardar aqui na meta' }, ...wallets.map((w) => ({ value: w.id, label: `Saldo da carteira ${w.name}` }))]}
        />
      </Field>
      {!goal && !walletId && (
        <Field label="Já tenho guardado (opcional)" htmlFor={ids.start} className="mt-3">
          <Input id={ids.start} inputMode="decimal" value={startVal} onChange={(e) => setStartVal(e.target.value)} placeholder="0,00" autoComplete="off" />
        </Field>
      )}
      <ErrorLine>{err}</ErrorLine>
      {goal && (
        <div className="mt-1">
          {confirmDel ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              Excluir a meta? Dá para desfazer logo depois.
              <Button type="button" size="sm" className="bg-neg text-white hover:bg-neg/90" onClick={remove}>
                Excluir
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                Voltar
              </Button>
            </p>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(true)}>
              <Trash2 aria-hidden="true" />
              Excluir meta
            </Button>
          )}
        </div>
      )}
      <Buttons onCancel={onClose} okLabel={goal ? 'Salvar' : 'Criar meta'} />
    </form>
  )
}

export function GoalMoveDialog({ open, onClose, goal, take }: { open: boolean; onClose: () => void; goal: Goal; take: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={`${take ? 'Retirar de' : 'Guardar em'} ${goal.name}`}>
      <GoalMoveForm goal={goal} take={take} onClose={onClose} />
    </Modal>
  )
}

function GoalMoveForm({ goal, take, onClose }: { goal: Goal; take: boolean; onClose: () => void }) {
  const { result, today, money } = useAppData()
  const write = useWrite()
  const gi = result ? goalInfo(result.data, goal, today) : null
  const ids = { amount: useId(), date: useId() }
  const [amount, setAmount] = useState(!take && gi && gi.perMonth > 0 ? formatMoneyInput(gi.perMonth) : '')
  const [date, setDate] = useState(today)
  const [err, setErr] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const v = parseMoney(amount)
    const bad = checkMove(gi?.saved ?? 0, v, take)
    if (bad) return setErr(bad.replace(/Só tem [\d,]+/, `Só tem ${money(gi?.saved ?? 0)}`))
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today
    const ok = write(
      `${take ? 'Retirado' : 'Guardado'} ${money(v)} · ${goal.name}`,
      (api) => replaceGoal(api, goal.id, (g) => moveGoal(g, v, take, d)),
      'Desfeito',
    )
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      {gi && (
        <p className="text-sm text-fg-muted">
          Guardado: <b className="num text-fg">{money(gi.saved)}</b> de <span className="num">{money(goal.target)}</span>
          {gi.left > 0.005 && !take && <> · faltam <span className="num">{money(gi.left)}</span></>}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoComplete="off" autoFocus />
        </Field>
        <Field label="Data" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <ErrorLine>{err}</ErrorLine>
      <Buttons onCancel={onClose} okLabel={take ? 'Retirar' : 'Guardar'} />
    </form>
  )
}

// ---------------------------------------------------------------- recorrentes

export function RecurringDialog({ open, onClose, rec }: { open: boolean; onClose: () => void; rec?: Recurring }) {
  return (
    <Modal open={open} onClose={onClose} title={rec ? 'Editar recorrente' : 'Novo lançamento recorrente'}>
      <RecurringForm rec={rec} onClose={onClose} />
    </Modal>
  )
}

function RecurringForm({ rec, onClose }: { rec?: Recurring; onClose: () => void }) {
  const { result, today, baseSettings } = useAppData()
  const write = useWrite()
  const wallets = result?.data.wallets ?? []
  const def = typeof baseSettings.defaultWalletId === 'string' && wallets.some((w) => w.id === baseSettings.defaultWalletId) ? baseSettings.defaultWalletId : (wallets[0]?.id ?? '')
  const start: RecurringInput = rec ? recurringToInput(rec) : emptyRecurringInput(today, def)
  const ids = { type: useId(), amount: useId(), cat: useId(), day: useId(), wallet: useId(), start: useId(), note: useId() }
  const [type, setType] = useState(start.type)
  const [amount, setAmount] = useState(start.amount ? formatMoneyInput(start.amount) : '')
  const [category, setCategory] = useState(start.category)
  const [day, setDay] = useState(String(start.day))
  const [walletId, setWalletId] = useState(start.walletId)
  const [startYm, setStartYm] = useState(start.start)
  const [note, setNote] = useState(start.note)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    const input: RecurringInput = { type, amount: parseMoney(amount), category, day: Number(day), walletId, start: startYm, note }
    const bad = checkRecurring(input, today, wallets.map((w) => w.id))
    if (bad) return setErr(bad)
    const ok = write(
      rec ? 'Recorrente atualizado' : 'Recorrente criado',
      (api) => {
        if (rec) replaceRecurring(api, rec.id, (r) => updateRecurring(r, input))
        else setRecurring(api, [...getRecurring(api), createRecurring(input)])
        postRecurring(api, today)
      },
      'Alteração desfeita',
    )
    if (ok) onClose()
  }

  function remove() {
    if (!rec) return
    const ok = write(
      `Recorrente "${rec.note || rec.category}" excluído (os lançamentos já feitos ficam)`,
      (api) => setRecurring(api, getRecurring(api).filter((r) => r.id !== rec.id)),
      'Recorrente restaurado',
    )
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <p className="text-sm text-fg-muted">Entra sozinho na carteira todo mês, no dia escolhido. Diferente das contas fixas, não precisa marcar como pago.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Tipo" htmlFor={ids.type}>
          <Select id={ids.type} value={type} onChange={setType} options={[{ value: 'gasto', label: 'Gasto' }, { value: 'entrada', label: 'Entrada' }]} />
        </Field>
        <Field label="Valor (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoComplete="off" autoFocus />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Categoria" htmlFor={ids.cat}>
          <Input id={ids.cat} value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Assinaturas" autoComplete="off" />
        </Field>
        <Field label="Todo dia" htmlFor={ids.day}>
          <Input id={ids.day} type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Carteira" htmlFor={ids.wallet}>
          <Select id={ids.wallet} value={walletId} onChange={setWalletId} options={wallets.map((w) => ({ value: w.id, label: w.name }))} />
        </Field>
        <Field label="A partir de" htmlFor={ids.start}>
          <Input id={ids.start} type="month" value={startYm} onChange={(e) => setStartYm(e.target.value)} />
        </Field>
      </div>
      <Field label="Nota (opcional)" htmlFor={ids.note} className="mt-3">
        <Input id={ids.note} value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} placeholder="Ex: Spotify" />
      </Field>
      <ErrorLine>{err}</ErrorLine>
      {rec && (
        <div className="mt-1">
          {confirmDel ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              Excluir o recorrente? Os lançamentos já feitos ficam.
              <Button type="button" size="sm" className="bg-neg text-white hover:bg-neg/90" onClick={remove}>
                Excluir
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                Voltar
              </Button>
            </p>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(true)}>
              <Trash2 aria-hidden="true" />
              Excluir recorrente
            </Button>
          )}
        </div>
      )}
      <Buttons onCancel={onClose} okLabel={rec ? 'Salvar' : 'Criar'} />
    </form>
  )
}
