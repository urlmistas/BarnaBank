import { useAppData } from '@/app/data-context'
import { initials } from '@/lib/finance/people'
import { cn } from '@/lib/utils'

/** Iniciais em estilo neutro (sem cor por pessoa). */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full border border-border bg-surface-2 font-medium text-fg-muted',
        size === 'lg' ? 'size-12 text-sm' : 'size-9 text-xs',
      )}
    >
      {initials(name)}
    </span>
  )
}

/** +R$ verde (a receber / entrou), −R$ vermelho (a pagar / saiu); `muted` tira a cor. */
export function SignedMoney({ value, muted, className }: { value: number; muted?: boolean; className?: string }) {
  const { money } = useAppData()
  const zero = Math.abs(value) < 0.005
  const sign = zero ? '' : value > 0 ? '+' : '−'
  return (
    <span
      className={cn(
        'num shrink-0 font-medium whitespace-nowrap',
        muted || zero ? 'text-fg-muted' : value > 0 ? 'text-pos' : 'text-neg',
        className,
      )}
    >
      {sign}
      {money(Math.abs(value))}
    </span>
  )
}
