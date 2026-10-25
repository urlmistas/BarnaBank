import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

// Menu de ações (botão "⋯"): lista própria, no mesmo estilo do Select, aberta num portal e posicionada com `fixed`.
export interface MenuItem {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  /** só para o rótulo: itens com lixeira ficam vermelhos pelo CSS global; este marca texto sem ícone */
  danger?: boolean
  hidden?: boolean
}

interface Place {
  right: number
  top?: number
  bottom?: number
  maxHeight: number
}

const WIDTH = 224

export function Menu({
  label,
  items,
  trigger,
  className,
}: {
  label: string
  items: MenuItem[]
  trigger: React.ReactNode
  className?: string
}) {
  const shown = items.filter((i) => !i.hidden)
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const [place, setPlace] = React.useState<Place | null>(null)
  const btn = React.useRef<HTMLButtonElement>(null)
  const list = React.useRef<HTMLUListElement>(null)
  const listId = React.useId()

  const close = React.useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }, [])

  React.useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const want = shown.length * 36 + 8
    const up = below < want && above > below
    const right = Math.max(8, window.innerWidth - r.right)
    setPlace(up ? { right, bottom: window.innerHeight - r.top + 4, maxHeight: above } : { right, top: r.bottom + 4, maxHeight: below })
  }, [open, shown.length])

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

  const run = (i: number) => {
    const it = shown[i]
    close()
    it?.onSelect()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = shown.length - 1
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(e.key === 'ArrowUp' ? last : 0)
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(last, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : last)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      run(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') close(false)
  }

  if (!shown.length) return null
  const host = open && btn.current ? (btn.current.closest('dialog') ?? document.body) : null

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setActive(0)
          setOpen((o) => !o)
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border text-fg-muted transition-colors outline-none hover:bg-surface-2 hover:text-fg focus-visible:border-border-strong [&_svg]:size-4',
          open && 'bg-surface-2 text-fg',
          className,
        )}
      >
        {trigger}
      </button>
      {host &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="menu"
            aria-label={label}
            style={{ position: 'fixed', width: WIDTH, right: place.right, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
            className="z-[100] overflow-y-auto overscroll-contain rounded-md border border-border-strong bg-surface p-1"
          >
            {shown.map((it, i) => (
              <li key={it.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  data-active={i === active}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => run(i)}
                  className={cn(
                    'flex min-h-8 w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm text-fg transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
                    i === active && 'bg-surface-2',
                    it.danger && 'hover:text-neg',
                  )}
                >
                  {it.icon}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </button>
              </li>
            ))}
          </ul>,
          host,
        )}
    </>
  )
}
