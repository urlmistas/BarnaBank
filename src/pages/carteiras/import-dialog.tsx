import { useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  applyImport, buildItems, countImport, knownCategories, knownImports, MAX_FILE_BYTES, MAX_PREVIEW, parseStatement, readCatRules, viewItems,
  type ParsedStatement,
} from '@/lib/finance/statement-import'
import type { AppData } from '@/lib/types'
import { cn } from '@/lib/utils'

// Importar extrato do banco (OFX ou CSV) para uma carteira, ou uma fatura CSV para um cartão.
// Mostra uma prévia antes de gravar: marca o que já foi importado e deixa corrigir as categorias.

export function ImportStatementButton({ data }: { data: AppData }) {
  const { canEdit } = useAppData()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<{ name: string; parsed: ParsedStatement } | null>(null)
  if (!canEdit) return null

  function pick() {
    if (!data.wallets.length && !data.cards.length) {
      toast.show('Crie uma carteira (ou um cartão) primeiro.')
      return
    }
    if (input.current) input.current.value = ''
    input.current?.click()
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_BYTES) return toast.show('Arquivo grande demais (máximo 5 MB).')
    try {
      const parsed = parseStatement(await f.arrayBuffer())
      if (!parsed) return toast.show('Não consegui ler esse arquivo. Use um extrato .ofx ou um .csv com colunas de data e valor.')
      setLoaded({ name: f.name.slice(0, 80), parsed })
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Não consegui ler esse arquivo.')
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={pick}>
        <Upload aria-hidden="true" />
        Importar extrato
      </Button>
      <input ref={input} type="file" accept=".ofx,.csv,.txt,text/csv" className="sr-only" tabIndex={-1} aria-label="Arquivo do extrato" onChange={onFile} />
      <Modal open={!!loaded} onClose={() => setLoaded(null)} title="Importar extrato" className="w-[min(640px,calc(100vw-32px))]">
        {loaded && <ImportForm data={data} fileName={loaded.name} parsed={loaded.parsed} onClose={() => setLoaded(null)} />}
      </Modal>
    </>
  )
}

function ImportForm({ data, fileName, parsed, onClose }: { data: AppData; fileName: string; parsed: ParsedStatement; onClose: () => void }) {
  const { money, date } = useAppData()
  const write = useWrite()
  const ids = { target: useId(), flip: useId(), all: useId(), list: useId() }
  const rules = useMemo(() => readCatRules(), [])
  const first = useMemo(() => buildItems(parsed.rows, knownImports(data)), [parsed, data])
  const cats = useMemo(() => knownCategories(data, rules), [data, rules])

  const options = [
    ...data.wallets.map((w) => ({ value: 'w:' + w.id, label: 'Carteira ' + w.name })),
    ...data.cards.map((c) => ({ value: 'c:' + c.id, label: `Cartão ${c.name} (vira compra no cartão)` })),
  ]
  const [target, setTarget] = useState(parsed.cardLike && data.cards.length ? 'c:' + data.cards[0].id : options[0].value)
  const [flip, setFlip] = useState(parsed.cardLike)
  const tgt = useMemo(() => ({ kind: target.startsWith('c:') ? ('card' as const) : ('wallet' as const), id: target.slice(2) }), [target])

  const views = useMemo(
    () => viewItems(first.items, { flip, target: tgt, transactions: data.transactions, rules }),
    [first, flip, tgt, data.transactions, rules],
  )
  // o que a pessoa mexeu: marcação e categoria por linha. Trocar destino/sinal recomeça das sugestões.
  const [marks, setMarks] = useState<Record<number, boolean>>({})
  const [catEdits, setCatEdits] = useState<Record<number, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const reset = () => {
    setMarks({})
    setCatEdits({})
  }

  const checked = (v: (typeof views)[number]) => (v.skip ? false : (marks[v.item.i] ?? v.checked))
  const nChecked = views.filter(checked).length
  const selectable = views.filter((v) => !v.skip)
  const allOn = selectable.length > 0 && selectable.every(checked)

  function submit() {
    const choices = views.filter(checked).map((v) => ({ item: v.item, category: catEdits[v.item.i] ?? v.guess, guess: v.guess }))
    if (!choices.length) return setErr('Nenhum lançamento marcado.')
    const plan = countImport(choices, { flip, target: tgt }, rules)
    const n = plan.tx + plan.cp
    if (!n) return setErr('Nenhum lançamento marcado.')
    const ok = write(
      `${n} lançamento${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'}${plan.learned ? ` · aprendi ${plan.learned} categoria${plan.learned === 1 ? '' : 's'}` : ''}`,
      (api) => void applyImport(api, choices, { flip, target: tgt }),
      'Importação desfeita',
    )
    if (ok) onClose()
  }

  return (
    <div className="px-5 py-4">
      <p className="text-sm text-fg-muted">
        <b className="text-fg">{fileName}</b> · {first.total} lançamento{first.total === 1 ? '' : 's'}
        {first.total > MAX_PREVIEW && ` (mostrando os ${MAX_PREVIEW} mais recentes)`}. Confira as categorias: o app aprende com as suas correções.
      </p>

      <Field label="Para onde" htmlFor={ids.target} className="mt-3">
        <Select
          id={ids.target}
          value={target}
          onChange={(v) => {
            setTarget(v)
            reset()
          }}
          options={options}
        />
      </Field>
      <label htmlFor={ids.flip} className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input
          id={ids.flip}
          type="checkbox"
          className="size-4"
          checked={flip}
          onChange={(e) => {
            setFlip(e.target.checked)
            reset()
          }}
        />
        Inverter sinais (marque se os gastos aparecerem como entradas)
      </label>

      <div className="mt-4 flex items-center justify-between gap-3 border-b border-border pb-2 text-sm">
        <label htmlFor={ids.all} className="flex cursor-pointer items-center gap-2">
          <input
            id={ids.all}
            type="checkbox"
            className="size-4"
            checked={allOn}
            onChange={(e) => setMarks(Object.fromEntries(selectable.map((v) => [v.item.i, e.target.checked])))}
          />
          Todos
        </label>
        <span aria-live="polite" className="text-xs text-fg-muted">
          {nChecked} de {views.length} marcados
        </span>
      </div>

      <ul id={ids.list} aria-label="Lançamentos do arquivo" className="max-h-[min(46dvh,420px)] overflow-y-auto">
        {views.map((v) => {
          const i = v.item.i
          return (
            <li key={i} className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border py-2', v.skip && 'opacity-55')}>
              <input
                type="checkbox"
                className="size-4"
                aria-label={`Importar ${v.item.desc}`}
                checked={checked(v)}
                disabled={v.skip}
                onChange={(e) => setMarks((m) => ({ ...m, [i]: e.target.checked }))}
              />
              <span className="min-w-0">
                <b className="block truncate text-sm font-medium">{v.item.desc}</b>
                <small className="block truncate text-xs text-fg-subtle">
                  {date(v.item.date)}
                  {v.why && ` · ${v.why}`}
                </small>
              </span>
              <span className={cn('num text-sm', v.amount < 0 ? 'text-neg' : 'text-pos')}>
                {v.amount < 0 ? '−' : '+'}
                {money(Math.abs(v.amount))}
              </span>
              <span />
              <Input
                list="import-cats"
                aria-label={`Categoria de ${v.item.desc}`}
                value={catEdits[i] ?? v.guess}
                maxLength={40}
                disabled={v.skip}
                onChange={(e) => setCatEdits((c) => ({ ...c, [i]: e.target.value }))}
                className="col-span-2 h-8 text-xs"
              />
            </li>
          )
        })}
      </ul>
      <datalist id="import-cats">
        {cats.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-xs text-neg">
        {err}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit}>
          Importar {nChecked}
        </Button>
      </div>
    </div>
  )
}
