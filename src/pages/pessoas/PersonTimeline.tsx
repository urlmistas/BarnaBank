import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CircleCheck, FilePlus2, type LucideIcon } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { personTimeline, type TimelineItem } from '@/lib/finance/person-facts'
import type { PersonDetail } from '@/lib/finance/people'
import { cn } from '@/lib/utils'
import { SignedMoney } from './parts'

// Linha do tempo: tudo que aconteceu com a pessoa, do mais recente para o mais antigo.

const KIND: Record<TimelineItem['kind'], { icon: LucideIcon; tone: string }> = {
  debt: { icon: FilePlus2, tone: 'text-fg-muted' },
  in: { icon: ArrowDownLeft, tone: 'text-pos' },
  out: { icon: ArrowUpRight, tone: 'text-neg' },
  late: { icon: AlertTriangle, tone: 'text-neg' },
  done: { icon: CircleCheck, tone: 'text-pos' },
}

export function PersonTimeline({ p }: { p: PersonDetail }) {
  const { today, date, money } = useAppData()
  const items = personTimeline(p, today)
  if (!items.length) {
    return <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-fg-muted">Nada aconteceu ainda com {p.name}.</p>
  }
  return (
    <ol aria-label={`Linha do tempo de ${p.name}`} className="relative flex flex-col">
      <span aria-hidden="true" className="absolute top-3 bottom-3 left-[15px] w-px bg-border" />
      {items.map((it) => {
        const k = KIND[it.kind]
        const Icon = k.icon
        return (
          <li key={it.key} className="relative flex gap-3 py-2.5">
            <span className={cn('relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface', k.tone)}>
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{it.title}</p>
              <p className="num text-xs text-fg-subtle">
                {date(it.date)}
                {it.detail && <span> · {it.detail}</span>}
              </p>
            </div>
            {it.amount != null &&
              (it.kind === 'in' || it.kind === 'out' ? (
                <SignedMoney value={it.kind === 'out' ? -it.amount : it.amount} className="self-start pt-0.5 text-sm" />
              ) : (
                <span className="num self-start pt-0.5 text-sm text-fg-muted">{money(it.amount)}</span>
              ))}
          </li>
        )
      })}
    </ol>
  )
}
