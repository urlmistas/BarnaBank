import { Check, CircleCheck, ClockAlert } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Tooltip } from '@/components/ui/tooltip'
import { initials, nameKey } from '@/lib/finance/people'
import { photoOf } from '@/lib/finance/person-photo'
import { cn } from '@/lib/utils'

/** Foto da pessoa (se tiver) ou as iniciais em estilo neutro (sem cor por pessoa). */
export function Avatar({ name, size = 'md', photo }: { name: string; size?: 'md' | 'lg'; photo?: string }) {
  const { result } = useAppData()
  const src = photo ?? photoOf(result?.data.contacts?.[nameKey(name)])
  const box = size === 'lg' ? 'size-14 text-base' : 'size-10 text-xs'
  if (src) return <img src={src} alt="" aria-hidden="true" className={cn('shrink-0 rounded-full border border-border object-cover', box)} />
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full border border-border bg-surface-2 font-medium text-fg-muted', box)}>
      {initials(name)}
    </span>
  )
}

/** Selinho no canto do avatar: em atraso, em dia ou quitado. */
export function StatusBadge({ status }: { status: 'late' | 'open' | 'settled' }) {
  const map = {
    late: { text: 'Em atraso', cls: 'bg-neg text-white', Icon: ClockAlert },
    open: { text: 'Em dia', cls: 'bg-pos text-bg', Icon: Check },
    settled: { text: 'Quitado', cls: 'border border-border-strong bg-surface-2 text-fg-muted', Icon: CircleCheck },
  }[status]
  return (
    <Tooltip label={map.text} side="bottom" className="absolute -right-0.5 -bottom-0.5">
      <span role="img" aria-label={map.text} className={cn('grid size-5 place-items-center rounded-full ring-2 ring-surface', map.cls)}>
        <map.Icon aria-hidden="true" className="size-3" strokeWidth={2.5} />
      </span>
    </Tooltip>
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
