import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight, CreditCard, HandCoins, Receipt, ArrowDownLeft, Search, ShoppingBag, Target, TrendingDown, TrendingUp, UserRound,
  UsersRound, Wallet, type LucideIcon,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { normTxt } from '@/lib/finance/people'
import { MAX_QUERY, searchAll, type SearchIcon, type SearchItem } from '@/lib/finance/search'
import { cn } from '@/lib/utils'
import { useAppData } from './data-context'

const ICONS: Record<SearchIcon, LucideIcon> = {
  user: UserRound,
  users: UsersRound,
  debt: HandCoins,
  wallet: Wallet,
  in: TrendingUp,
  out: TrendingDown,
  transfer: ArrowLeftRight,
  bill: Receipt,
  'bill-in': ArrowDownLeft,
  card: CreditCard,
  purchase: ShoppingBag,
  goal: Target,
}

/** destaca o trecho achado (comparando sem acento) */
function Mark({ text, q }: { text: string; q: string }): ReactNode {
  const s = String(text ?? '')
  const i = q ? normTxt(s).indexOf(q) : -1
  if (i < 0) return s
  return (
    <>
      {s.slice(0, i)}
      <mark className="rounded-[2px] bg-accent/25 text-fg">{s.slice(i, i + q.length)}</mark>
      {s.slice(i + q.length)}
    </>
  )
}

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Buscar" className="w-[min(560px,calc(100vw-32px))]">
      <SearchBody onClose={onClose} />
    </Modal>
  )
}

function SearchBody({ onClose }: { onClose: () => void }) {
  const { result, today, money, date } = useAppData()
  const navigate = useNavigate()
  const inputId = useId()
  const listId = useId()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const activeRef = useRef<HTMLButtonElement>(null)

  const sections = useMemo(() => (result ? searchAll(result.data, text, today, { money, date }) : []), [result, text, today, money, date])
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])
  const q = normTxt(text.trim().slice(0, MAX_QUERY))

  useEffect(() => setActive(0), [text])
  useEffect(() => activeRef.current?.scrollIntoView?.({ block: 'nearest' }), [active])

  const go = (it: SearchItem | undefined) => {
    if (!it) return
    onClose()
    navigate(it.to)
  }
  const onKey = (e: KeyboardEvent) => {
    if (!flat.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(flat[active])
    }
  }

  let n = -1
  return (
    <div className="px-4 py-3" onKeyDown={onKey}>
      <label htmlFor={inputId} className="sr-only">
        Buscar
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          id={inputId}
          value={text}
          maxLength={MAX_QUERY}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pessoa, carteira, categoria, conta, compra ou valor"
          autoComplete="off"
          autoFocus
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls={listId}
          aria-activedescendant={flat.length ? `${listId}-${active}` : undefined}
          className="pl-9"
        />
      </div>
      <div id={listId} role="listbox" aria-label="Resultados" className="mt-3 max-h-[min(60dvh,420px)] overflow-y-auto">
        {!q ? (
          <p className="px-1 py-6 text-center text-sm text-fg-muted">
            Busque por pessoa, grupo, carteira, categoria, conta fixa, compra no cartão ou meta.
            <br />
            Dá para buscar por valor também: <b className="num text-fg">45,00</b>
          </p>
        ) : !sections.length ? (
          <p role="status" className="px-1 py-6 text-center text-sm text-fg-muted">
            Nada encontrado para “{text.trim().slice(0, MAX_QUERY)}”.
          </p>
        ) : (
          sections.map((s) => (
            <div key={s.title} className="mb-2">
              <p className="px-1 pt-2 pb-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
                {s.title}
                {s.more > 0 && ` · +${s.more}`}
              </p>
              {s.items.map((it) => {
                const i = ++n
                const Icon = ICONS[it.icon]
                const on = i === active
                return (
                  <button
                    key={s.title + i}
                    id={`${listId}-${i}`}
                    ref={on ? activeRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => go(it)}
                    onMouseMove={() => setActive(i)}
                    className={cn('flex w-full cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-left', on ? 'bg-surface-2' : 'hover:bg-surface-2')}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-border text-fg-muted">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm font-medium">
                        <Mark text={it.title} q={q} />
                      </b>
                      <small className="block truncate text-xs text-fg-subtle">
                        <Mark text={it.sub} q={q} />
                      </small>
                    </span>
                    {it.amount != null && (
                      <span className={cn('num shrink-0 text-sm', it.dir === 'in' ? 'text-pos' : it.dir === 'out' ? 'text-neg' : 'text-fg')}>
                        {money(it.amount)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
