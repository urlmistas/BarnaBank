import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

export interface TabItem<T extends string> {
  value: T
  label: string
  count?: number
}

/** Abas (WAI-ARIA tabs, ativação automática). O painel é um <TabPanel> com o mesmo baseId. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
  baseId,
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: TabItem<T>[]
  label: string
  baseId: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const idx = Math.max(0, items.findIndex((t) => t.value === value))

  function onKeyDown(e: KeyboardEvent) {
    let next = -1
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(items[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('flex gap-1 border-b border-border', className)}>
      {items.map((t, i) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.value}`}
            aria-selected={on}
            aria-controls={`${baseId}-panel-${t.value}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative flex h-10 cursor-pointer items-center gap-1.5 px-3 text-sm font-medium transition-colors',
              on ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="num text-xs text-fg-subtle">{t.count}</span>}
            {on && (
              <motion.span
                layoutId={`${baseId}-underline`}
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ baseId, value, children, className }: { baseId: string; value: string; children: ReactNode; className?: string }) {
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={cn('rounded-sm', className)}
    >
      {children}
    </div>
  )
}
