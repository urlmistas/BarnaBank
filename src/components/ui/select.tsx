import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Seleção com lista própria (no lugar do <select> nativo). Botão com role="combobox" + lista role="listbox".
// A lista é desenhada num portal (dentro do <dialog> aberto, se houver, para ficar acima dele) e posicionada
// com `fixed`, então não é cortada pelo rolamento dos diálogos.
export interface SelectOption<T extends string> {
  value: T
  label: string
}

interface Place {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

const GAP = 4
const MAX_LIST = 256

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  id,
  disabled,
  ...props
}: {
  value: T
  onChange: (v: T) => void
  options: SelectOption<T>[]
  className?: string
} & Omit<React.ComponentProps<'button'>, 'value' | 'onChange' | 'type'>) {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const [place, setPlace] = React.useState<Place | null>(null)
  const btn = React.useRef<HTMLButtonElement>(null)
  const list = React.useRef<HTMLUListElement>(null)
  const listId = React.useId()
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const current = options.find((o) => o.value === value)

  const close = React.useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }, [])

  const show = () => {
    setActive(selected)
    setOpen(true)
  }

  const pick = (i: number) => {
    const o = options[i]
    if (o) onChange(o.value)
    close()
  }

  // posição: abaixo do botão; se não couber e houver mais espaço em cima, abre para cima
  React.useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - GAP - 8
    const above = r.top - GAP - 8
    const up = below < Math.min(MAX_LIST, options.length * 36 + 8) && above > below
    setPlace(
      up
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + GAP, maxHeight: Math.min(MAX_LIST, above) }
        : { left: r.left, width: r.width, top: r.bottom + GAP, maxHeight: Math.min(MAX_LIST, below) },
    )
  }, [open, options.length])

  // fecha ao clicar fora, rolar a página ou redimensionar
  React.useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (list.current?.contains(t) || btn.current?.contains(t)) return
      close(false)
    }
    const away = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return
      close(false)
    }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('resize', away)
    window.addEventListener('scroll', away, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('resize', away)
      window.removeEventListener('scroll', away, true)
    }
  }, [open, close])

  // mantém o item ativo à vista
  React.useEffect(() => {
    if (!open || !place) return
    list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, place, active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = options.length - 1
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        show()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(last, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(last)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        pick(active)
        break
      case 'Escape':
        // não deixa o Esc fechar também o diálogo que contém o campo
        e.preventDefault()
        e.stopPropagation()
        close()
        break
      case 'Tab':
        close(false)
        break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const k = e.key.toLowerCase()
          const from = options.findIndex((o, i) => i > active && o.label.toLowerCase().startsWith(k))
          const any = from >= 0 ? from : options.findIndex((o) => o.label.toLowerCase().startsWith(k))
          if (any >= 0) setActive(any)
        }
    }
  }

  const host = open && btn.current ? (btn.current.closest('dialog') ?? document.body) : null

  return (
    <div className={cn('relative w-full', className)}>
      <button
        {...props}
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-9 w-full cursor-pointer items-center rounded-sm border border-border bg-surface pr-9 pl-3 text-left text-sm text-fg transition-colors outline-none hover:border-border-strong focus-visible:border-border-strong disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-border-strong',
        )}
      >
        <span className="min-w-0 truncate">{current?.label ?? ''}</span>
      </button>
      <ChevronDown
        aria-hidden="true"
        className={cn('pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle transition-transform', open && 'rotate-180')}
      />
      {host &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            style={{ position: 'fixed', left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
            className="bb-pop z-[100] overflow-y-auto overscroll-contain rounded-md border border-border-strong bg-surface p-1 shadow-lg"
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                role="option"
                data-value={o.value}
                aria-selected={o.value === value}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={cn(
                  'flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-fg',
                  i === active && 'bg-surface-2',
                  o.value === value && 'font-medium',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && <Check aria-hidden="true" className="size-4 shrink-0 text-accent-text" />}
              </li>
            ))}
          </ul>,
          host,
        )}
    </div>
  )
}
