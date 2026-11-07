import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Tecla de atalho em miniatura (ex.: Ctrl K). */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface-2 px-1.5 font-sans text-[10.5px] font-medium text-fg-muted',
        className,
      )}
      {...props}
    />
  )
}
