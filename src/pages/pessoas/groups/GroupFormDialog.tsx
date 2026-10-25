import { useId, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { makeDebtCalc } from '@/lib/finance/debts'
import {
  addParticipants, checkGroupInput, createGroup, editWarnings, emptyGroupInput, groupSumNote, groupToInput, updateGroup, withEqualSplit,
  type GroupData, type GroupInput, type GroupPart,
} from '@/lib/finance/groups'
import { initials } from '@/lib/finance/people'
import { formatMoneyInput, parseMoney } from '@/lib/money-input'
import { cn } from '@/lib/utils'
import type { Debt, DebtKind } from '@/lib/types'

// Dívida em grupo: um título, um total, uma lista de pessoas. O app gera uma dívida por pessoa (saveGroup ~l.2860).

export function GroupFormDialog({ open, onClose, group, kind = 'receivable', onSaved }: {
  open: boolean
  onClose: () => void
  group?: GroupData
  kind?: DebtKind
  onSaved?: (id: string) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={group ? 'Editar grupo' : 'Nova dívida em grupo'} className="w-[min(520px,calc(100vw-32px))]">
      <GroupForm group={group} kind={kind} onClose={onClose} onSaved={onSaved} />
    </Modal>
  )
}

const moneyOrBlank = (v: number) => (v > 0 ? formatMoneyInput(v) : '')

function GroupForm({ group, kind, onClose, onSaved }: { group?: GroupData; kind: DebtKind; onClose: () => void; onSaved?: (id: string) => void }) {
  const { result, today, money } = useAppData()
  const write = useWrite()
  const ids = { title: useId(), total: useId(), date: useId(), due: useId(), wallet: useId(), notes: useId(), part: useId() }
  const calc = makeDebtCalc(today)
  const debts: Debt[] = result?.data.debts ?? []
  const wallets = result?.data.wallets ?? []
  const [form, setForm] = useState<GroupInput>(() => (group ? groupToInput(group, debts) : emptyGroupInput(kind, today)))
  const [totalText, setTotalText] = useState(group ? formatMoneyInput(group.total) : '')
  const [removed, setRemoved] = useState<GroupPart[]>([])
  const [partText, setPartText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const origTotal = group?.total ?? 0

  const pay = form.kind === 'payable'
  const inc = form.kind === 'receivable' && form.includeMe
  // na divisão igual os valores saem sempre da conta; na por valor ficam como a pessoa digitou
  const view = withEqualSplit(form)
  const note = groupSumNote(form, money)
  const warnings = group ? editWarnings(form, removed, origTotal, money) : []
  const patch = (p: Partial<GroupInput>) => setForm((f) => ({ ...f, ...p }))

  function addNames(text: string) {
    const r = addParticipants(form.parts, removed, text)
    patch({ parts: r.parts })
    setRemoved(r.removed)
    setErr(r.dupes.length ? `${r.dupes.join(', ')} ${r.dupes.length > 1 ? 'já estão' : 'já está'} no grupo.` : null)
    setPartText('')
  }

  function removePart(i: number) {
    const p = form.parts[i]
    patch({ parts: form.parts.filter((_, k) => k !== i) })
    if (p?.debtId) setRemoved((r) => [...r, p])
  }

  function setPartAmount(i: number, text: string) {
    const v = parseMoney(text)
    const amount = isNaN(v) || v < 0 ? 0 : v
    patch({ parts: form.parts.map((p, k) => (k === i ? { ...p, amount } : p)) })
  }

  function save(e: FormEvent) {
    e.preventDefault()
    let cur = form
    if (partText.trim()) {
      const r = addParticipants(form.parts, removed, partText)
      cur = { ...form, parts: r.parts }
    }
    cur = { ...cur, total: parseMoney(totalText) }
    const bad = checkGroupInput(cur)
    if (bad) {
      setForm(cur)
      return setErr(bad)
    }
    setErr(null)
    // o texto do aviso depende do resultado; as mesmas contas rodam de novo sobre o armazenamento atual, dentro da gravação
    let message: string
    let savedId: string
    if (group) {
      const r = updateGroup(group, cur, debts, calc)
      savedId = group.id
      message = 'Grupo atualizado' + (r.detached ? ` · ${r.detached} virou individual` : '') + (r.removed ? ` · ${r.removed} removido${r.removed > 1 ? 's' : ''}` : '')
    } else {
      const r = createGroup(cur, debts)
      savedId = r.group.id
      message = `Grupo criado: ${r.created} ${r.created === 1 ? 'dívida gerada' : 'dívidas geradas'}`
    }
    const ok = write(
      message,
      (api) => {
        if (group) {
          const r = updateGroup(group, cur, api.debts, calc)
          api.debts = r.debts
          api.groups = api.groups.map((g) => (g.id === group.id ? { ...g, ...r.group } : g))
        } else {
          const r = createGroup(cur, api.debts, savedId)
          api.debts = r.debts
          api.groups.push(r.group)
        }
      },
      group ? 'Alteração do grupo desfeita' : 'Grupo desfeito',
    )
    if (ok) {
      onSaved?.(savedId)
      onClose()
    }
  }

  return (
    <form onSubmit={save} className="px-5 py-4" noValidate>
      {!group && (
        <div role="group" aria-label="Tipo" className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-border p-1">
          {(['receivable', 'payable'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={form.kind === v}
              onClick={() => patch({ kind: v, includeMe: v === 'receivable' ? form.includeMe : false })}
              className={cn('h-8 cursor-pointer rounded-sm text-sm font-medium transition-colors', form.kind === v ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg')}
            >
              {v === 'receivable' ? 'Me devem' : 'Eu devo'}
            </button>
          ))}
        </div>
      )}

      <Field label="Nome do grupo" htmlFor={ids.title}>
        <Input id={ids.title} value={form.title} maxLength={60} onChange={(e) => patch({ title: e.target.value })} placeholder="Ex: Churrasco de sábado" autoComplete="off" autoFocus />
      </Field>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor total (R$)" htmlFor={ids.total}>
          <Input id={ids.total} inputMode="decimal" value={totalText} onChange={(e) => { setTotalText(e.target.value); patch({ total: parseMoney(e.target.value) }) }} placeholder="0,00" autoComplete="off" />
        </Field>
        <Field label="Data" htmlFor={ids.date}>
          <Input id={ids.date} type="date" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Pagar até" htmlFor={ids.due}>
          <Input id={ids.due} type="date" value={form.dueDate} onChange={(e) => patch({ dueDate: e.target.value })} />
        </Field>
        <Field label="Carteira dos pagamentos" htmlFor={ids.wallet}>
          <Select
            id={ids.wallet}
            value={form.walletId}
            onChange={(v) => patch({ walletId: v })}
            options={[{ value: '', label: '— nenhuma —' }, ...wallets.map((w) => ({ value: w.id, label: w.name }))]}
          />
        </Field>
      </div>

      <div role="group" aria-label="Como dividir" className="mt-4 grid grid-cols-2 gap-1 rounded-md border border-border p-1">
        {([['equal', 'Dividir igual'], ['custom', 'Valor de cada um']] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={form.split === v}
            onClick={() => setForm((f) => ({ ...withEqualSplit(f), split: v }))}
            className={cn('h-8 cursor-pointer rounded-sm text-sm font-medium transition-colors', form.split === v ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg')}
          >
            {label}
          </button>
        ))}
      </div>

      {form.kind === 'receivable' && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={form.includeMe} onChange={(e) => patch({ includeMe: e.target.checked })} className="size-4" />
          Eu também participo (minha parte não vira dívida)
        </label>
      )}

      <p className="mt-4 text-xs font-medium text-fg-muted">{pay ? 'Para quem eu devo' : 'Quem participa'}</p>
      <div className="mt-1 flex gap-2">
        <Input
          id={ids.part}
          aria-label={pay ? 'Nome de quem eu devo' : 'Nome de quem participa'}
          value={partText}
          onChange={(e) => (/[,;]/.test(e.target.value) ? addNames(e.target.value) : setPartText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (partText.trim()) addNames(partText)
            }
          }}
          placeholder="Digite um nome (ou vários, separados por vírgula)"
          autoComplete="off"
        />
        <Button type="button" variant="outline" onClick={() => addNames(partText)} disabled={!partText.trim()}>
          <Plus aria-hidden="true" /> Adicionar
        </Button>
      </div>

      <ul aria-label="Participantes" className="mt-2 rounded-md border border-border">
        {view.parts.length === 0 && <li className="px-3 py-4 text-sm text-fg-muted">Ninguém ainda. Digite um nome acima e toque em Adicionar.</li>}
        {view.parts.map((p, i) => (
          <li key={(p.debtId ?? 'novo') + ':' + p.name} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs text-fg-muted">
              {initials(p.name)}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate">{p.name}</span>
              {p.locked && <small className="block text-xs text-fg-subtle">{pay ? 'já paguei' : 'já pagou'} <span className="num">{money(p.paid)}</span></small>}
            </span>
            {form.split === 'custom' && !p.locked ? (
              <Input
                aria-label={`Valor de ${p.name}`}
                inputMode="decimal"
                className="num w-28 text-right"
                value={form.parts[i]?.amount ? formatMoneyInput(form.parts[i].amount) : ''}
                onChange={(e) => setPartAmount(i, e.target.value)}
                placeholder="0,00"
                autoComplete="off"
              />
            ) : (
              <span className="num text-sm">{money(p.amount || 0)}</span>
            )}
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={`Remover ${p.name}`} onClick={() => removePart(i)}>
              <X />
            </Button>
          </li>
        ))}
        {inc && (
          <li className="flex items-center gap-3 border-t border-border bg-surface-2/50 px-3 py-2">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-xs text-fg-muted">EU</span>
            <span className="min-w-0 flex-1 text-sm">
              Você<small className="block text-xs text-fg-subtle">sua parte, não vira dívida</small>
            </span>
            {form.split === 'custom' ? (
              <Input
                aria-label="Sua parte"
                inputMode="decimal"
                className="num w-28 text-right"
                value={moneyOrBlank(form.me)}
                onChange={(e) => {
                  const v = parseMoney(e.target.value)
                  patch({ me: isNaN(v) || v < 0 ? 0 : v })
                }}
                placeholder="0,00"
                autoComplete="off"
              />
            ) : (
              <span className="num text-sm">{money(view.me || 0)}</span>
            )}
          </li>
        )}
      </ul>

      <p
        role="status"
        className={cn('mt-2 text-xs', note.tone === 'ok' ? 'text-pos' : note.tone === 'bad' ? 'text-neg' : 'text-fg-muted')}
      >
        {note.text}
      </p>

      {warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
          <b className="text-fg">Ao salvar:</b>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Field label="Anotações (opcional)" htmlFor={ids.notes} className="mt-3">
        <textarea
          id={ids.notes}
          value={form.notes}
          maxLength={400}
          rows={2}
          onChange={(e) => patch({ notes: e.target.value })}
          className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-border-strong"
        />
      </Field>

      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-xs text-neg">
        {err}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit">{group ? 'Salvar grupo' : 'Criar grupo'}</Button>
      </div>
    </form>
  )
}
