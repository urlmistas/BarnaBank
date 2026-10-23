import { useRef, type KeyboardEvent } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  count?: number
}

/**
 * Controle segmentado (role=radiogroup). Setas esquerda/direita trocam a opção,
 * Home/End vão às pontas; só a opção marcada fica no Tab.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentedOption<T>[]
  label: string
  id: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const idx = Math.max(0, options.findIndex((o) => o.value === value))

  function onKeyDown(e: KeyboardEvent) {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('flex w-full rounded-md border border-border bg-surface p-0.5', className)}
    >
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-sm px-2 text-xs font-medium whitespace-nowrap transition-colors',
              on ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {on && (
              <motion.span
                layoutId={id}
                aria-hidden="true"
                className="absolute inset-0 rounded-sm border border-border-strong bg-surface-2"
                transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              />
            )}
            <span className="relative">{o.label}</span>
            {o.count !== undefined && o.count > 0 && <span className="num relative text-fg-subtle">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
