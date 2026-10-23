import * as React from 'react'
import { cn } from '@/lib/utils'

// Base: shadcn/ui Input — borda 1px, sem sombra.
function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-sm border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors outline-none hover:border-border-strong focus-visible:border-border-strong disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
