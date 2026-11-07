import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Tooltip único do site, no estilo do shadcn/ui: balão invertido (fundo claro no tema escuro e o contrário) com uma setinha
// apontando para o controle. Aparece ao passar o mouse ou focar com teclado. Só CSS: não captura o ponteiro nem prende foco.
// O controle de dentro continua precisando do próprio nome acessível (aria-label).

type Side = 'top' | 'bottom'
type Align = 'center' | 'start' | 'end'

const BUBBLE_SIDE: Record<Side, string> = { top: 'bottom-full mb-2', bottom: 'top-full mt-2' }
const BUBBLE_ALIGN: Record<Align, string> = { center: 'left-1/2 -translate-x-1/2', start: 'left-0', end: 'right-0' }
const ARROW_SIDE: Record<Side, string> = { top: '-bottom-1', bottom: '-top-1' }
const ARROW_ALIGN: Record<Align, string> = { center: 'left-1/2 -translate-x-1/2', start: 'left-3', end: 'right-3' }

export function Tooltip({
  label,
  children,
  side = 'top',
  align = 'center',
  className,
  bubbleClassName,
}: {
  label: string
  children: ReactNode
  /** de que lado do controle o balão aparece */
  side?: Side
  /** alinhamento do balão: `end` evita cortar na borda direita da tela */
  align?: Align
  className?: string
  /** classes extras só do balão (ex.: `md:hidden` para escondê-lo em telas grandes) */
  bubbleClassName?: string
}) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-xs scale-95 rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg opacity-0 shadow-md transition duration-150',
          'group-hover/tip:scale-100 group-hover/tip:opacity-100 group-hover/tip:delay-200 group-focus-within/tip:scale-100 group-focus-within/tip:opacity-100',
          BUBBLE_SIDE[side],
          BUBBLE_ALIGN[align],
          bubbleClassName,
        )}
      >
        {label}
        <span aria-hidden="true" className={cn('absolute size-2.5 rotate-45 rounded-[2px] bg-fg', ARROW_SIDE[side], ARROW_ALIGN[align])} />
      </span>
    </span>
  )
}
