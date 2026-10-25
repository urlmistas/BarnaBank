import { useId, useMemo, useState, type FormEvent } from 'react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { addDaysISO, EPS, round2 } from '@/lib/finance/dates'
import {
  applyReneg, buildReneg, extendDefault, extendTargets, planSegments, remainingLabel, renegDefaults, rescheduleDebt, segLabel, type RenegMode,
} from '@/lib/finance/renegotiation'
import { allTags, notesOf, tagsOf, withTagsNotes } from '@/lib/finance/person-extra'
import { boardData } from '@/lib/finance/trust'
import { firstName } from '@/lib/format'
import { formatMoneyInput, parseMoney } from '@/lib/money-input'
import { replaceDebt } from '@/lib/store'
import type { Debt } from '@/lib/types'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/finance/people'

// Diálogos extras de Pessoas: renegociar, dar mais prazo, etiquetas e notas, placar dos amigos.

function Actions({ onCancel, okLabel, disabled }: { onCancel: () => void; okLabel: string; disabled?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={disabled}>
        {okLabel}
      </Button>
    </div>
  )
}

const ErrorLine = ({ children }: { children: React.ReactNode }) => (
  <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-xs text-neg">
    {children}
  </p>
)

// ---------------------------------------------------------------- renegociar

export function RenegDialog({ open, onClose, debt }: { open: boolean; onClose: () => void; debt: Debt }) {
  return (
    <Modal open={open} onClose={onClose} title={`Renegociar · ${firstName(debt.name)}`}>
      <RenegForm debt={debt} onClose={onClose} />
    </Modal>
  )
}

const MODES: { value: RenegMode; label: string }[] = [
  { value: 'depois', label: 'Pagar depois que acabar, em parcelas de' },
  { value: 'fim', label: 'Tudo numa parcela só, no fim' },
  { value: 'estender', label: 'Mais parcelas do novo valor, até acabar' },
]

function RenegForm({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { today, money, date } = useAppData()
  const write = useWrite()
  const df = useMemo(() => renegDefaults(debt, today), [debt, today])
  const ids = { value: useId(), start: useId(), diff: useId(), note: useId() }
  const [value, setValue] = useState(formatMoneyInput(df.curV))
  const [start, setStart] = useState(df.start)
  const [mode, setMode] = useState<RenegMode>('depois')
  const [diff, setDiff] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const v = parseMoney(value)
  const lower = v > 0 && v * df.count < df.open - EPS
  const effMode: RenegMode = lower ? mode : 'depois'
  const diffValue = parseMoney(diff)
  const built = useMemo(
    () => buildReneg(debt, today, { value: v, start, mode: effMode, diffValue: isNaN(diffValue) ? 0 : diffValue }),
    [debt, today, v, start, effMode, diffValue],
  )
  const segs = built ? planSegments(built.plan.slice(built.keep)) : []
  const diffHint = lower ? formatMoneyInput(round2((df.open - v * df.count) / df.count)) : ''

  if (!(df.open > EPS)) {
    return (
      <div className="px-5 py-4">
        <p className="text-sm text-fg-muted">Essa dívida já está quitada.</p>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!built) return setErr('Confira o novo valor e a data (no máximo 360 parcelas).')
    const next = applyReneg(debt, built, today, money, note)
    const ok = write(`${firstName(debt.name)}: dívida renegociada`, (api) => replaceDebt(api, debt.id, () => next), 'Renegociação desfeita')
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
        Falta <b className="num text-fg">{money(df.open)}</b> ({remainingLabel(debt, today, money)}). As parcelas já pagas continuam como estão.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Novo valor da parcela" htmlFor={ids.value}>
          <Input id={ids.value} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="1ª parcela nova vence em" htmlFor={ids.start}>
          <Input id={ids.start} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
      </div>

      {lower && (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-fg-muted">O que sobrar de cada parcela</legend>
          <div className="mt-1 flex flex-col gap-1.5">
            {MODES.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="reneg-mode" checked={mode === m.value} onChange={() => setMode(m.value)} className="size-4" />
                <span className="flex flex-wrap items-center gap-2">
                  {m.label}
                  {m.value === 'depois' && (
                    <Input
                      id={ids.diff}
                      aria-label="Valor das parcelas da diferença"
                      inputMode="decimal"
                      value={diff}
                      onChange={(e) => setDiff(e.target.value)}
                      placeholder={diffHint || 'auto'}
                      className="h-8 w-24"
                      autoComplete="off"
                    />
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Field label="Motivo (opcional)" htmlFor={ids.note} className="mt-3">
        <Input id={ids.note} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="Ex: combinamos de baixar a parcela" />
      </Field>

      <div aria-live="polite" className="mt-3 rounded-md border border-border px-3 py-2 text-xs">
        {built ? (
          <>
            <b className="text-fg">Fica assim</b>
            {segs.map((sg, i) => (
              <p key={i} className="mt-1 flex justify-between gap-3 text-fg-muted">
                <span className="num">{segLabel(sg, money)}</span>
                <span className="num text-fg-subtle">{sg.n > 1 ? `${date(sg.from)} a ${date(sg.to)}` : date(sg.from)}</span>
              </p>
            ))}
            <p className="num mt-1.5 text-fg-subtle">
              Total {money(built.open)} · termina em {date(built.plan[built.plan.length - 1].due)}
            </p>
          </>
        ) : (
          <span className="text-fg-subtle">{v > 0 ? 'Com esse valor ficaria com parcelas demais.' : 'Digite o novo valor da parcela.'}</span>
        )}
      </div>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel="Renegociar" />
    </form>
  )
}

// ---------------------------------------------------------------- dar mais prazo

export function ExtendDialog({ open, onClose, debt }: { open: boolean; onClose: () => void; debt: Debt }) {
  return (
    <Modal open={open} onClose={onClose} title={`Dar mais prazo · ${firstName(debt.name)}`}>
      <ExtendForm debt={debt} onClose={onClose} />
    </Modal>
  )
}

function ExtendForm({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { today, date } = useAppData()
  const write = useWrite()
  const targets = useMemo(() => extendTargets(debt, today), [debt, today])
  const late = targets.length > 0 && targets[0].dueISO < today
  const id = useId()
  const [nd, setNd] = useState(extendDefault(debt, today))
  const [err, setErr] = useState<string | null>(null)
  const cur = targets.length ? targets[targets.length - 1].dueISO : today

  if (!targets.length) {
    return (
      <div className="px-5 py-4">
        <p className="text-sm text-fg-muted">Essa dívida já está quitada.</p>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) return setErr('Escolha a nova data.')
    const { debt: next, moved } = rescheduleDebt(debt, today, nd)
    if (!moved) return setErr(`Escolha uma data depois do vencimento atual (${date(cur)}).`)
    const ok = write(`Prazo de ${firstName(debt.name)} até ${date(nd)}`, (api) => replaceDebt(api, debt.id, () => next), 'Prazo desfeito')
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4" noValidate>
      <p className="text-sm text-fg-muted">
        {late
          ? `${targets.length === 1 ? 'A parcela atrasada passa' : `As ${targets.length} parcelas atrasadas passam`} a vencer na data abaixo.`
          : 'A próxima parcela passa a vencer na data abaixo.'}{' '}
        Os valores não mudam.
      </p>
      <Field label="Novo vencimento" htmlFor={id} className="mt-3">
        <Input id={id} type="date" min={addDaysISO(today, 1)} value={nd} onChange={(e) => setNd(e.target.value)} autoFocus />
      </Field>
      <ErrorLine>{err}</ErrorLine>
      <Actions onCancel={onClose} okLabel="Remarcar" />
    </form>
  )
}

// ---------------------------------------------------------------- etiquetas e notas

export function TagsDialog({ open, onClose, personKey, name }: { open: boolean; onClose: () => void; personKey: string; name: string }) {
  return (
    <Modal open={open} onClose={onClose} title={`${firstName(name)}: etiquetas e notas`}>
      <TagsForm personKey={personKey} name={name} onClose={onClose} />
    </Modal>
  )
}

function TagsForm({ personKey, name, onClose }: { personKey: string; name: string; onClose: () => void }) {
  const { result } = useAppData()
  const write = useWrite()
  const contacts = result?.data.contacts
  const c = contacts?.[personKey]
  const ids = { other: useId(), notes: useId() }
  const [tags, setTags] = useState<string[]>(() => tagsOf(c))
  const [other, setOther] = useState('')
  const [notes, setNotes] = useState(() => notesOf(c))
  const all = useMemo(() => allTags(contacts ?? {}, tagsOf(c)), [contacts, c])
  const toggle = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  function submit(e: FormEvent) {
    e.preventDefault()
    const final = other.trim() && !tags.includes(other.trim()) ? [...tags, other.trim()] : tags
    const ok = write('Salvo', (api) => {
      api.contacts[personKey] = withTagsNotes(api.contacts[personKey], final, notes) as Record<string, unknown>
    })
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="px-5 py-4">
      <p className="text-xs font-medium text-fg-muted">Etiquetas</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {all.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tags.includes(t)}
            onClick={() => toggle(t)}
            className={cn(
              'h-8 cursor-pointer rounded-full border px-3 text-xs transition-colors',
              tags.includes(t) ? 'border-accent bg-accent/15 text-fg' : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <Field label="Outra etiqueta" htmlFor={ids.other} className="mt-3">
        <Input id={ids.other} value={other} maxLength={24} onChange={(e) => setOther(e.target.value)} placeholder="Ex: Vizinho" autoComplete="off" />
      </Field>
      <Field label={`Notas sobre ${firstName(name)}`} htmlFor={ids.notes} className="mt-3">
        <textarea
          id={ids.notes}
          value={notes}
          maxLength={400}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Ex: recebe dia 5, cobrar depois disso"
          className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-border-strong"
        />
      </Field>
      <Actions onCancel={onClose} okLabel="Salvar" />
    </form>
  )
}

// ---------------------------------------------------------------- placar

export function BoardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Placar dos amigos" className="w-[min(560px,calc(100vw-32px))]">
      <BoardBody onClose={onClose} />
    </Modal>
  )
}

function BoardBody({ onClose }: { onClose: () => void }) {
  const { result, today, money } = useAppData()
  const rows = useMemo(() => boardData(result?.data.debts ?? [], today), [result, today])
  return (
    <div className="px-5 py-4">
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Quando você emprestar para alguém, o placar aparece aqui.</p>
      ) : (
        <>
          <p className="text-xs text-fg-muted">Quem paga em dia sobe; quem atrasa desce. Só você vê.</p>
          <ol aria-label="Placar" className="mt-3 overflow-hidden rounded-md border border-border">
            {rows.map((p, i) => (
              <li key={p.key} className="flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                <span className="num w-5 shrink-0 pt-1 text-sm text-fg-subtle">{i + 1}</span>
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-medium">
                  {initials(p.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  {p.medals.length > 0 && (
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
                      {p.medals.map((m) => (
                        <span key={m.label}>
                          <span aria-hidden="true">{m.icon} </span>
                          {m.label}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="num mt-0.5 text-xs text-fg-subtle">
                    {p.rel && `pontualidade ${Math.round(p.rel.pct)}%${p.rel.late ? ` · atraso médio ${p.rel.avgDelay}d` : ''} · `}
                    pegou {money(p.lent)} · devolveu {money(p.paid)}
                    {p.open > EPS && ` · deve ${money(p.open)}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Fechar</Button>
      </div>
    </div>
  )
}
