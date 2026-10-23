import * as React from 'react'
import { cn } from '@/lib/utils'

// Base: shadcn/ui Card — borda 1px, sem sombra.
function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return <section data-slot="card" className={cn('rounded-lg border border-border bg-surface', className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex items-center justify-between gap-3 px-5 pt-4 pb-3', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" className={cn('text-sm font-medium text-fg', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5 pb-5', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardContent }
