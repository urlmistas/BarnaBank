import * as React from 'react'
import { cn } from '@/lib/utils'

// Base: shadcn/ui Skeleton (pulso desligado com prefers-reduced-motion)
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn('rounded-sm bg-surface-2 motion-safe:animate-pulse', className)} {...props} />
}

export { Skeleton }
