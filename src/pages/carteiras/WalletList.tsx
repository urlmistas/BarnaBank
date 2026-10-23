import { useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppData } from '@/app/data-context'
import type { WalletCardInfo, WalletRow } from '@/lib/finance/wallets'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { walletHref } from './links'
import { cardSummary, noYear } from './text'
import { WalletIcon } from './wallet-icon'

export function WalletList({ rows, selectedId, search, onCreate }: { rows: WalletRow[]; selectedId?: string; search: string; onCreate?: () => void }) {
  const listRef = useRef<HTMLUListElement>(null)
  if (!rows.length) return <NoWallets onCreate={onCreate} />

  // setas ↑/↓ andam entre as linhas
  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-row]') ?? [])
    const i = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (i < 0) return
    e.preventDefault()
    links[Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  return (
    <section aria-label="Lista de carteiras" className="min-w-0">
      <ul ref={listRef} onKeyDown={onListKey} aria-label="Carteiras" className="overflow-hidden rounded-lg border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.wallet.id} className="border-b border-border last:border-b-0">
            <WalletRowLink row={r} selected={selectedId === r.wallet.id} href={walletHref(r.wallet.id, search)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function WalletRowLink({ row, selected, href }: { row: WalletRow; selected: boolean; href: string }) {
  const { money, date } = useAppData()
  const neg = row.balance < -0.005
  const sub = row.count ? `${row.kind} · ${plural(row.count, 'movimento', 'movimentos')}` : `${row.kind} · sem movimentos`
  const cardsTxt = row.cards.map((c) => cardSummary(c, money, date)).join('; ')
  return (
    <Link
      to={href}
      data-row
      aria-current={selected ? 'page' : undefined}
      aria-label={`${row.wallet.name}, ${sub}, saldo ${money(row.balance)}${cardsTxt ? '. ' + cardsTxt : ''}`}
      className={cn(
        'relative block px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-offset-[-2px]',
        selected && 'bg-surface-2',
      )}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <span className="flex items-center gap-3">
        <WalletIcon icon={row.wallet.icon} className="text-fg-subtle" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{row.wallet.name}</span>
          <span className="block truncate text-xs text-fg-subtle">{sub}</span>
        </span>
        <span className={cn('num shrink-0 text-sm font-medium whitespace-nowrap', neg ? 'text-neg' : 'text-fg')}>{money(row.balance)}</span>
      </span>
      {row.cards.map((c) => (
        <CardLine key={c.card.id} c={c} />
      ))}
    </Link>
  )
}

/** Uma linha compacta por cartão pago por esta carteira: fatura do mês · vencimento · limite. */
function CardLine({ c }: { c: WalletCardInfo }) {
  const { money, date } = useAppData()
  const late = c.invoiceStatus === 'atrasada'
  return (
    <span aria-hidden="true" className="mt-2 flex items-center gap-2 border-t border-dashed border-border pt-2 text-xs text-fg-muted">
      <CreditCard className="size-3.5 shrink-0 text-fg-subtle" />
      <span className="min-w-0 flex-1 truncate">
        {c.card.name} <span className="num text-fg">{money(c.invoiceTotal)}</span>
        <span className={cn(late ? 'text-neg' : 'text-fg-subtle')}>
          {' · '}
          {late ? 'atrasada' : c.invoiceStatus === 'paga' ? 'paga' : 'vence'} <span className="num">{noYear(date(c.due))}</span>
        </span>
      </span>
      {c.usedPct !== null && (
        <span className="flex shrink-0 items-center gap-1.5 text-fg-subtle">
          <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-surface-2 sm:block">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${c.usedPct}%` }} />
          </span>
          <span className="num">{Math.round(c.usedPct)}% do limite</span>
        </span>
      )}
    </span>
  )
}

function NoWallets({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <Wallet aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="mt-3 text-base font-medium">Nenhuma carteira ainda</p>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        {onCreate
          ? 'Crie carteiras para a conta do banco, o dinheiro, a poupança. Elas aparecem aqui com o saldo e os movimentos de cada mês.'
          : 'Crie carteiras no BarnaBank atual (conta do banco, dinheiro, poupança). Elas aparecem aqui com o saldo e os movimentos de cada mês.'}
      </p>
      {onCreate && (
        <Button size="sm" className="mt-4" onClick={onCreate}>
          Criar carteira
        </Button>
      )}
    </div>
  )
}
