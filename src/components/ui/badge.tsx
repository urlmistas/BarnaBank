import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Base: shadcn/ui Badge
const badgeVariants = cva('inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      outline: 'border-border text-fg-muted',
      accent: 'border-accent/40 text-accent-text',
    },
  },
  defaultVariants: { variant: 'outline' },
})

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
