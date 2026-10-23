import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Select nativo com o visual dos outros campos (funciona bem no celular).
export interface SelectOption<T extends string> {
  value: T
  label: string
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  ...props
}: {
  value: T
  onChange: (v: T) => void
  options: SelectOption<T>[]
  className?: string
} & Omit<React.ComponentProps<'select'>, 'value' | 'onChange'>) {
  return (
    <div className={cn('relative w-full', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 w-full cursor-pointer appearance-none rounded-sm border border-border bg-surface pr-9 pl-3 text-sm text-fg transition-colors outline-none hover:border-border-strong focus-visible:border-border-strong"
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" />
    </div>
  )
}
