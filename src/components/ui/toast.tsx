import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CircleCheck } from 'lucide-react'

// Aviso curto no rodapé, com "Desfazer" opcional. Um de cada vez.
interface ToastItem {
  id: number
  message: string
  undo?: () => void
  icon?: ReactNode
}

interface ToastApi {
  show: (message: string, undo?: () => void, icon?: ReactNode) => void
}

const Ctx = createContext<ToastApi | null>(null)
const DURATION = 7000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null)
  const seq = useRef(0)

  const show = useCallback((message: string, undo?: () => void, icon?: ReactNode) => {
    setItem({ id: ++seq.current, message, undo, icon })
  }, [])

  useEffect(() => {
    if (!item) return
    const t = window.setTimeout(() => setItem(null), DURATION)
    return () => window.clearTimeout(t)
  }, [item])

  const api = useMemo(() => ({ show }), [show])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6"
      >
        <AnimatePresence mode="wait">
          {item && (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="pointer-events-auto relative flex max-w-md items-center gap-3 overflow-hidden rounded-lg border border-border-strong bg-surface-2 py-3 pr-4 pl-5 text-sm shadow-[0_10px_32px_-8px_rgba(0,0,0,0.55)]"
            >
              {/* faixa da cor da marca na borda esquerda */}
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
              {(item.icon || item.undo) && (
                <span className="shrink-0 text-pos [&_svg]:size-5">{item.icon ?? <CircleCheck aria-hidden="true" />}</span>
              )}
              <span className="min-w-0">{item.message}</span>
              {item.undo && (
                <>
                  <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-strong" />
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-sm px-1 py-0.5 text-sm font-semibold text-accent-text transition-colors hover:underline focus-visible:underline"
                    onClick={() => {
                      item.undo?.()
                      setItem(null)
                    }}
                  >
                    Desfazer
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  return useContext(Ctx) ?? { show: () => {} }
}
