import { useId, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { simulateLoan } from '@/lib/finance/simulator'
import { parseMoney } from '@/lib/money-input'
import type { InterestType } from '@/lib/types'
import { useAppData } from './data-context'

// Simulador de empréstimo: calcula antes de emprestar, sem salvar nada.
export function SimulatorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Simulador de empréstimo">
      <SimulatorBody />
    </Modal>
  )
}

function SimulatorBody() {
  const { money } = useAppData()
  const ids = { p: useId(), r: useId(), n: useId(), t: useId() }
  const [principal, setPrincipal] = useState('100,00')
  const [rate, setRate] = useState('10')
  const [n, setN] = useState('1')
  const [type, setType] = useState<InterestType>('composto')

  const sim = useMemo(() => {
    const p = parseMoney(principal)
    const r = parseFloat(rate.replace(',', '.'))
    const parcels = parseInt(n, 10)
    return simulateLoan(isNaN(p) ? 0 : p, isNaN(r) ? 0 : r, isNaN(parcels) ? 1 : parcels, type, money)
  }, [principal, rate, n, type, money])
  const parcels = Math.min(600, Math.max(1, parseInt(n, 10) || 1))

  return (
    <div className="px-5 py-4">
      <p className="text-sm text-fg-muted">Calcule antes de emprestar. Nada é salvo.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Valor a emprestar (R$)" htmlFor={ids.p}>
          <Input id={ids.p} inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="Juros ao mês (%)" htmlFor={ids.r}>
          <Input id={ids.r} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Número de parcelas" htmlFor={ids.n}>
          <Input id={ids.n} type="number" min={1} max={600} step={1} value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
        <Field label="Tipo de juros" htmlFor={ids.t}>
          <Select
            id={ids.t}
            value={type}
            onChange={setType}
            options={[
              { value: 'composto', label: 'Composto (padrão)' },
              { value: 'simples', label: 'Simples' },
              { value: 'price', label: 'Tabela Price' },
            ]}
          />
        </Field>
      </div>

      <dl aria-live="polite" className="mt-4 grid grid-cols-3 divide-x divide-border rounded-md border border-border">
        {[
          { label: `Parcela (${parcels}x)`, value: sim.installment },
          { label: 'Total', value: sim.total },
          { label: 'Juros', value: sim.profit },
        ].map((it) => (
          <div key={it.label} className="min-w-0 px-3 py-2.5">
            <dt className="text-xs text-fg-muted">{it.label}</dt>
            <dd className="num mt-0.5 truncate text-sm font-semibold">{money(it.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-md bg-surface-2 px-3 py-2.5 text-xs text-fg-muted">
        <p className="font-medium text-fg">Como chegamos nesse valor</p>
        {sim.formula.map((l, i) => (
          <p key={i} className="num mt-1">
            {l}
          </p>
        ))}
      </div>
    </div>
  )
}
