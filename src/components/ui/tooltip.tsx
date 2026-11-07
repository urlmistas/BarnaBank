import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Dica curta ao passar o mouse ou focar com o teclado. Só CSS: o rótulo fica acima do controle e não captura o ponteiro.
// O controle de dentro continua precisando do próprio nome acessível (aria-label).
export function Tooltip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-xs whitespace-nowrap text-fg opacity-0 shadow-lg transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}
