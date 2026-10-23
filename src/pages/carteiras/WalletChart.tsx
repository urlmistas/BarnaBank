import { useMemo } from 'react'
import { useAppData } from '@/app/data-context'
import { walletSeries } from '@/lib/finance/wallets'
import type { AppData } from '@/lib/types'
import { BalanceChart } from '@/pages/inicio/BalanceChart'

/** Aba "Saldo no tempo": saldo da carteira dia a dia, uma série só. Carregada sob demanda. */
export function WalletChart({ data, walletId }: { data: AppData; walletId: string }) {
  const { today, money, date } = useAppData()
  const series = useMemo(() => walletSeries(data, walletId, today), [data, walletId, today])
  if (series.length < 2) {
    return <p className="text-sm text-fg-subtle">O gráfico aparece quando houver movimentos em mais de um dia.</p>
  }
  const first = series[0]
  const last = series[series.length - 1]
  const values = series.map((p) => p.total)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return (
    <section aria-labelledby="saldo-tempo-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="saldo-tempo-titulo" className="text-xs font-medium text-fg-muted">
          Saldo desde <span className="num">{date(first.date)}</span>
        </h3>
        <p className="num text-xs text-fg-subtle">
          de {money(first.total)} para <span className="text-fg">{money(last.total)}</span>
        </p>
      </div>
      <div className="mt-3">
        <BalanceChart
          className="h-48"
          points={series}
          label={`Saldo da carteira de ${date(first.date)} a ${date(last.date)}: de ${money(first.total)} para ${money(last.total)}; menor ${money(lo)}, maior ${money(hi)}`}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
        <div>
          <dt className="text-fg-muted">Menor saldo</dt>
          <dd className="num mt-0.5 text-sm font-medium">{money(lo)}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Maior saldo</dt>
          <dd className="num mt-0.5 text-sm font-medium">{money(hi)}</dd>
        </div>
      </dl>
    </section>
  )
}
