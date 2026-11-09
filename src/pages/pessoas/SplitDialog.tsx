import { useId, useMemo, useState } from 'react'
import { Copy, Plus, Share2, Trash2, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { settleUp } from '@/lib/finance/settle'
import { parseMoney } from '@/lib/money-input'
import { cn } from '@/lib/utils'

// Racha de contas: cada um paga uma coisa na viagem ou no rolê; no fim o app diz quem paga quem, com o menor número de
// transferências. É uma calculadora (não grava nada). Para cobrar alguém, use "Nova dívida".

const MAX_PEOPLE = 12
const MAX_EXPENSES = 40

interface ExpenseRow {
  id: number
  desc: string
  amount: string
  payer: string
  /** vazio = todos */
  among: string[]
}

let nextId = 1

export function SplitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Racha de contas" className="max-w-xl">
      <SplitBody />
    </Modal>
  )
}

function SplitBody() {
  const { money } = useAppData()
  const toast = useToast()
  const ids = { people: useId(), desc: useId() }
  const [people, setPeople] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [rows, setRows] = useState<ExpenseRow[]>([])

  function addPeople() {
    const names = draft
      .split(/[,;\n]/)
      .map((n) => n.trim().slice(0, 30))
      .filter(Boolean)
    if (!names.length) return
    setPeople((cur) => {
      const have = new Set(cur.map((p) => p.toLowerCase()))
      const add = names.filter((n) => !have.has(n.toLowerCase()) && have.add(n.toLowerCase()))
      return [...cur, ...add].slice(0, MAX_PEOPLE)
    })
    setDraft('')
  }
  function removePerson(name: string) {
    setPeople((cur) => cur.filter((p) => p !== name))
    setRows((cur) => cur.map((r) => ({ ...r, payer: r.payer === name ? '' : r.payer, among: r.among.filter((a) => a !== name) })))
  }
  const patch = (id: number, p: Partial<ExpenseRow>) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const result = useMemo(
    () =>
      settleUp(
        people,
        rows.map((r) => ({ desc: r.desc, amount: parseMoney(r.amount) || 0, payer: r.payer || people[0] || '', among: r.among })),
      ),
    [people, rows],
  )

  const text = useMemo(() => {
    const lines = ['Racha de contas · total ' + money(result.total)]
    for (const p of people) lines.push(`${p}: pagou ${money(result.paid[p])}, parte ${money(result.share[p])}`)
    lines.push('')
    lines.push(result.transfers.length ? 'Para acertar:' : 'Está tudo certo, ninguém deve ninguém.')
    for (const t of result.transfers) lines.push(`${t.from} paga ${money(t.amount)} a ${t.to}`)
    return lines.join('\n')
  }, [result, people, money])

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.show('Resumo copiado')
    } catch {
      toast.show('Não consegui copiar. Selecione o texto e copie.')
    }
  }

  const payerOptions = people.map((p) => ({ value: p, label: p }))

  return (
    <div className="px-5 py-4">
      <p className="text-sm text-fg-muted">Coloque as pessoas e o que cada um pagou. O app calcula quem paga quem, com o mínimo de transferências.</p>

      <Field label="Pessoas (separe por vírgula)" htmlFor={ids.people} className="mt-4">
        <div className="flex gap-2">
          <Input
            id={ids.people}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addPeople()
              }
            }}
            placeholder="Ana, Bia, Caio"
            autoComplete="off"
          />
          <Button type="button" variant="outline" onClick={addPeople}>
            Adicionar
          </Button>
        </div>
      </Field>
      {people.length > 0 && (
        <ul aria-label="Pessoas do racha" className="mt-2 flex flex-wrap gap-1.5">
          {people.map((p) => (
            <li key={p} className="inline-flex h-7 items-center gap-1 rounded-full border border-border pr-1 pl-3 text-xs">
              {p}
              <button type="button" aria-label={`Tirar ${p}`} onClick={() => removePerson(p)} className="grid size-5 cursor-pointer place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg">
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {people.length >= 2 && (
        <>
          <h3 className="mt-5 text-xs font-medium tracking-wide text-fg-subtle uppercase">Despesas</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {rows.map((r, i) => (
              <li key={r.id} className="rounded-md border border-border p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
                  <Field label={`Despesa ${i + 1}`} htmlFor={`${ids.desc}-d${r.id}`}>
                    <Input id={`${ids.desc}-d${r.id}`} value={r.desc} maxLength={40} onChange={(e) => patch(r.id, { desc: e.target.value })} placeholder="Ex.: Jantar" autoComplete="off" />
                  </Field>
                  <Field label="Valor (R$)" htmlFor={`${ids.desc}-v${r.id}`}>
                    <Input id={`${ids.desc}-v${r.id}`} inputMode="decimal" value={r.amount} onChange={(e) => patch(r.id, { amount: e.target.value })} placeholder="0,00" autoComplete="off" />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Apagar despesa ${i + 1}`} onClick={() => setRows((cur) => cur.filter((x) => x.id !== r.id))}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <Field label="Quem pagou" htmlFor={`${ids.desc}-p${r.id}`} className="mt-2">
                  <Select id={`${ids.desc}-p${r.id}`} value={r.payer || people[0]} onChange={(v) => patch(r.id, { payer: v })} options={payerOptions} />
                </Field>
                <fieldset className="mt-2">
                  <legend className="text-xs font-medium text-fg-muted">Dividir entre {r.among.length === 0 ? '(todos)' : ''}</legend>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {people.map((p) => {
                      const on = r.among.length === 0 || r.among.includes(p)
                      return (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            const cur = r.among.length === 0 ? people : r.among
                            const next = on ? cur.filter((x) => x !== p) : [...cur, p]
                            // sem ninguém marcado não dá para dividir: volta para todos
                            patch(r.id, { among: next.length === people.length || next.length === 0 ? [] : next })
                          }}
                          className={cn('h-7 cursor-pointer rounded-full border px-3 text-xs', on ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted')}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              </li>
            ))}
          </ul>
          {rows.length < MAX_EXPENSES && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setRows((cur) => [...cur, { id: nextId++, desc: '', amount: '', payer: people[0], among: [] }])}
            >
              <Plus aria-hidden="true" />
              Adicionar despesa
            </Button>
          )}
        </>
      )}

      {people.length >= 2 && result.total > 0 && (
        <section aria-label="Resultado do racha" className="mt-5 rounded-md border border-border bg-surface-2/40 p-3">
          <p className="text-sm">
            Total gasto: <b className="num font-semibold">{money(result.total)}</b>
          </p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {people.map((p) => (
              <li key={p} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">{p}</span>
                <span className={cn('num shrink-0 text-xs', result.balance[p] > 0.004 ? 'text-pos' : result.balance[p] < -0.004 ? 'text-neg' : 'text-fg-muted')}>
                  pagou {money(result.paid[p])} · parte {money(result.share[p])}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-3 text-xs font-medium tracking-wide text-fg-subtle uppercase">Para acertar</h3>
          {result.transfers.length === 0 ? (
            <p className="mt-1 text-sm text-fg-muted">Está tudo certo: ninguém deve ninguém.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {result.transfers.map((t) => (
                <li key={t.from + '>' + t.to}>
                  <b className="font-medium">{t.from}</b> paga <b className="num font-semibold">{money(t.amount)}</b> a <b className="font-medium">{t.to}</b>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              Copiar resumo
            </Button>
            {canShare && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.share({ text }).catch((e: unknown) => {
                    if (!(e instanceof DOMException && e.name === 'AbortError')) toast.show('Não consegui abrir o compartilhamento.')
                  })
                }}
              >
                <Share2 aria-hidden="true" />
                Compartilhar
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
