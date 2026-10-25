import { useId, useMemo, useState, type FormEvent } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { simulatePurchase, ymShort, type FitsMethod, type Verdict } from '@/lib/finance/fits'
import { newId } from '@/lib/finance/mutations'
import { parseMoney } from '@/lib/money-input'
import type { AppData } from '@/lib/types'
import { cn } from '@/lib/utils'

// "Cabe no meu mês?": simula uma compra (à vista ou parcelada no cartão) contra o saldo previsto dos próximos meses.
export function FitsDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: AppData }) {
  return (
    <Modal open={open} onClose={onClose} title="Cabe no meu mês?" className="w-[min(560px,calc(100vw-32px))]">
      <FitsBody data={data} onClose={onClose} />
    </Modal>
  )
}

const VERDICT: Record<Verdict, { icon: typeof CircleCheck; text: string; tone: string }> = {
  ok: { icon: CircleCheck, text: 'Cabe!', tone: 'text-pos' },
  tight: { icon: CircleAlert, text: 'Cabe, mas fica apertado', tone: 'text-fg' },
  no: { icon: X, text: 'Não cabe', tone: 'text-neg' },
}

function FitsBody({ data, onClose }: { data: AppData; onClose: () => void }) {
  const { today, money, canEdit } = useAppData()
  const write = useWrite()
  const ids = { desc: useId(), amount: useId(), n: useId(), how: useId() }
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [n, setN] = useState('1')
  const options = [
    ...data.cards.map((c) => ({ value: 'c:' + c.id, label: 'Cartão ' + c.name })),
    ...data.wallets.map((w) => ({ value: 'w:' + w.id, label: 'À vista / PIX · ' + w.name })),
  ]
  const [how, setHow] = useState(options[0]?.value ?? '')
  const [err, setErr] = useState<string | null>(null)

  const value = parseMoney(amount)
  const parcels = Math.max(1, Math.min(24, parseInt(n, 10) || 1))
  const method = useMemo<FitsMethod>(() => (how.startsWith('c:') ? { kind: 'card', id: how.slice(2) } : { kind: 'wallet', id: how.slice(2) }), [how])
  const sim = useMemo(() => (value > 0 && how ? simulatePurchase(data, today, value, parcels, method) : null), [data, today, value, parcels, how, method])

  if (!data.wallets.length)
    return <p className="px-5 py-6 text-sm text-fg-muted">Crie uma carteira primeiro: a conta usa o seu saldo.</p>

  function register(e: FormEvent) {
    e.preventDefault()
    if (!(value > 0)) return setErr('Informe o valor.')
    const label = desc.trim().slice(0, 50) || 'Compra'
    const ok = write(
      `Compra registrada: ${label}`,
      (api) => {
        if (method.kind === 'card') {
          api.cardPurchases.push({ id: 'p-' + newId(), cardId: method.id, desc: label, amount: value, installments: parcels, date: today, category: '' })
        } else {
          api.transactions.push({ id: newId(), walletId: method.id, type: 'gasto', amount: value, date: today, category: 'Compras', note: label })
        }
      },
      'Compra desfeita',
    )
    if (ok) onClose()
  }

  const V = sim ? VERDICT[sim.verdict] : null
  const why = !sim
    ? ''
    : sim.limitMsg
      ? `${sim.limitMsg} Disponível ${money(Math.max(0, sim.available ?? 0))}.`
      : sim.verdict === 'ok'
        ? `Pior mês: sobra ${money(sim.minWith)} em ${ymShort(sim.minKey!)}.`
        : sim.verdict === 'tight'
          ? `Em ${ymShort(sim.minKey!)} sobra só ${money(sim.minWith)}.`
          : `Em ${ymShort(sim.minKey!)} faltariam ${money(-sim.minWith)}.`

  return (
    <form onSubmit={register} className="px-5 py-4" noValidate>
      <Field label="O que é" htmlFor={ids.desc}>
        <Input id={ids.desc} value={desc} maxLength={50} onChange={(e) => setDesc(e.target.value)} placeholder="Ex: Celular novo" autoComplete="off" autoFocus />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Valor total (R$)" htmlFor={ids.amount}>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoComplete="off" />
        </Field>
        <Field label="Parcelas" htmlFor={ids.n}>
          <Input id={ids.n} type="number" min={1} max={24} step={1} value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
      </div>
      <Field label="Como vai pagar" htmlFor={ids.how} className="mt-3">
        <Select id={ids.how} value={how} onChange={setHow} options={options} />
      </Field>

      <div aria-live="polite" className="mt-4">
        {!sim || !V ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">Digite o valor para ver.</p>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-md border border-border px-4 py-3">
              <V.icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', V.tone)} />
              <div className="min-w-0">
                <p className={cn('text-sm font-semibold', V.tone)}>{V.text}</p>
                <p className="num mt-0.5 text-xs text-fg-muted">
                  {parcels > 1 ? `${parcels}x de ${money(sim.parcel)}` : money(value)}
                  {sim.card && `, 1ª parcela na fatura de ${ymShort(sim.firstKey)}`} · {why}
                </p>
              </div>
            </div>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Saldo previsto no fim de cada mês, sem e com a compra</caption>
              <thead>
                <tr className="text-left text-xs text-fg-muted">
                  <th className="py-1 font-medium">Mês</th>
                  <th className="py-1 text-right font-medium">Sem a compra</th>
                  <th className="py-1 text-right font-medium">Com a compra</th>
                </tr>
              </thead>
              <tbody>
                {sim.rows.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="py-1.5">
                      {ymShort(r.key)}
                      {r.cost > 0 && <small className="num ml-1 text-xs text-fg-subtle">−{money(r.cost)}</small>}
                    </td>
                    <td className={cn('num py-1.5 text-right', r.without < 0 && 'text-neg')}>{money(r.without)}</td>
                    <td className={cn('num py-1.5 text-right', r.with < 0 && 'text-neg')}>{money(r.with)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 flex gap-2 text-xs text-fg-subtle">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Saldo previsto no fim de cada mês: carteiras + o que vai receber − contas, faturas, dívidas, recorrentes e a média dos seus gastos do dia a dia.
            </p>
          </>
        )}
      </div>

      <p role="alert" aria-live="assertive" className="mt-2 min-h-5 text-xs text-neg">
        {err}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Fechar
        </Button>
        {canEdit && <Button type="submit">Registrar a compra</Button>}
      </div>
    </form>
  )
}
