import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { paymentSeries, personMonthEvents, personMonthRange, type CalEvent, type PersonDetail } from '@/lib/finance/people'
import { daysInMonth, pad2, parseISO, ymAdd, ymOf } from '@/lib/finance/dates'
import { MONTHS } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BalanceChart } from '@/pages/inicio/BalanceChart'
import { SignedMoney } from './parts'

const WD = [
  ['D', 'domingo'],
  ['S', 'segunda'],
  ['T', 'terça'],
  ['Q', 'quarta'],
  ['Q', 'quinta'],
  ['S', 'sexta'],
  ['S', 'sábado'],
] as const

/** Aba "Calendário" da pessoa: mês com os vencimentos dela + recebido acumulado. */
export function PersonCalendar({ p }: { p: PersonDetail }) {
  const { today, money } = useAppData()
  const range = useMemo(() => personMonthRange(p, today), [p, today])
  const [ym, setYm] = useState(range.initial)
  const events = useMemo(() => personMonthEvents(p, ym), [p, ym])
  // hoje (se tiver algo), senão o primeiro vencimento pendente do mês, senão o primeiro
  const defaultSel =
    (ymOf(today) === ym && events.some((e) => e.date === today) ? today : (events.find((e) => !e.done) ?? events[0])?.date) ??
    (ymOf(today) === ym ? today : null)
  const [picked, setPicked] = useState<string | null>(null)
  const sel = picked && ymOf(picked) === ym ? picked : defaultSel

  const byDay = new Map<string, CalEvent[]>()
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const pending = events.filter((e) => !e.done)
  const inSum = pending.filter((e) => e.dir === 'in').reduce((s, e) => s + e.amount, 0)
  const outSum = pending.filter((e) => e.dir === 'out').reduce((s, e) => s + e.amount, 0)

  const y = +ym.slice(0, 4)
  const m = +ym.slice(5, 7) - 1
  const first = new Date(y, m, 1).getDay()
  const dim = daysInMonth(y, m)
  const title = `${MONTHS[m]} de ${y}`
  const selEvents = sel ? (byDay.get(sel) ?? []) : []

  const dir = p.hasReceivable ? 'in' : 'out'
  const series = paymentSeries(p, dir)

  return (
    <div className="flex flex-col gap-5">
      <section aria-label={`Vencimentos de ${title}`}>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" aria-label="Mês anterior" disabled={ym <= range.min} onClick={() => setYm(ymAdd(ym, -1))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0 text-center">
            <h3 className="text-sm font-medium first-letter:uppercase" aria-live="polite">
              {title}
            </h3>
            <p className="num text-xs text-fg-muted">
              {inSum > 0 && <>entra {money(inSum)}</>}
              {inSum > 0 && outSum > 0 && ' · '}
              {outSum > 0 && <>sai {money(outSum)}</>}
              {inSum === 0 && outSum === 0 && (events.length ? 'tudo resolvido' : 'nada vence neste mês')}
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Próximo mês" disabled={ym >= range.max} onClick={() => setYm(ymAdd(ym, 1))}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {WD.map(([s, full]) => (
            <abbr key={full} title={full} className="py-1 text-xs text-fg-subtle no-underline">
              {s}
            </abbr>
          ))}
          {Array.from({ length: first }, (_, i) => (
            <span key={'e' + i} aria-hidden="true" />
          ))}
          {Array.from({ length: dim }, (_, i) => {
            const day = i + 1
            const iso = `${ym}-${pad2(day)}`
            const list = byDay.get(iso) ?? []
            const isToday = iso === today
            const marks = (
              <span aria-hidden="true" className="flex h-1.5 items-center justify-center gap-0.5">
                {list.some((e) => !e.done && e.dir === 'in') && <i className="size-1.5 rounded-full bg-pos" />}
                {list.some((e) => !e.done && e.dir === 'out') && <i className="size-1.5 rounded-full bg-neg" />}
                {list.length > 0 && list.every((e) => e.done) && <i className="size-1.5 rounded-full bg-fg-subtle" />}
              </span>
            )
            const cls = cn(
              'flex h-10 flex-col items-center justify-center gap-0.5 rounded-sm border text-sm',
              isToday ? 'border-accent/60' : 'border-transparent',
              iso < today && 'text-fg-subtle',
            )
            if (!list.length)
              return (
                <span key={iso} className={cls}>
                  <span className="num">{day}</span>
                  {marks}
                </span>
              )
            const late = list.some((e) => e.late)
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setPicked(iso)}
                aria-pressed={sel === iso}
                aria-label={`${day} de ${MONTHS[m]}: ${list.length} ${list.length === 1 ? 'vencimento' : 'vencimentos'}${late ? ', em atraso' : ''}${isToday ? ', hoje' : ''}`}
                className={cn(cls, 'cursor-pointer font-medium text-fg hover:bg-surface-2', sel === iso && 'border-border-strong bg-surface-2')}
              >
                <span className="num">{day}</span>
                {marks}
              </button>
            )
          })}
        </div>

        <ul aria-label="Legenda" className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
          <li className="flex items-center gap-1.5"><i aria-hidden="true" className="size-1.5 rounded-full bg-pos" />a receber</li>
          <li className="flex items-center gap-1.5"><i aria-hidden="true" className="size-1.5 rounded-full bg-neg" />a pagar</li>
          <li className="flex items-center gap-1.5"><i aria-hidden="true" className="size-1.5 rounded-full bg-fg-subtle" />resolvido</li>
        </ul>

        {sel && (
          <div className="mt-4">
            <h4 className="text-xs font-medium text-fg-muted">{dayTitle(sel)}</h4>
            {selEvents.length === 0 ? (
              <p className="mt-2 text-sm text-fg-subtle">Nada vence neste dia.</p>
            ) : (
              <ul className="mt-2 rounded-md border border-border">
                {selEvents.map((e) => (
                  <li key={e.key} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{e.title}</span>
                      <span className={cn('block truncate text-xs', e.late ? 'text-neg' : 'text-fg-subtle')}>
                        {e.sub}
                        {e.done ? (e.dir === 'in' ? ' · recebida' : ' · paga') : e.late ? ' · em atraso' : ''}
                      </span>
                    </span>
                    <SignedMoney value={e.dir === 'in' ? e.amount : -e.amount} muted={e.done} className="text-sm" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="serie-titulo" className="border-t border-border pt-4">
        <h3 id="serie-titulo" className="text-xs font-medium text-fg-muted">
          {dir === 'in' ? 'Recebido ao longo do tempo' : 'Pago ao longo do tempo'}
        </h3>
        {series.length > 1 ? (
          <div className="mt-2">
            <BalanceChart
              points={series}
              label={`${dir === 'in' ? 'Recebido' : 'Pago'} acumulado: ${money(series[series.length - 1].total)} em ${series.length} datas`}
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-fg-subtle">
            {series.length === 1 ? `Um pagamento até agora: ${money(series[0].total)}.` : 'O gráfico aparece a partir do segundo pagamento.'}
          </p>
        )}
      </section>
    </div>
  )
}

function dayTitle(iso: string) {
  const d = parseISO(iso)
  const wd = WD[d.getDay()][1]
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`
}
