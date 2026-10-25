import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'

// Aviso curto no rodapé, com "Desfazer" opcional. Um de cada vez.
interface ToastItem {
  id: number
  message: string
  undo?: () => void
}

interface ToastApi {
  show: (message: string, undo?: () => void) => void
}

const Ctx = createContext<ToastApi | null>(null)
const DURATION = 7000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null)
  const seq = useRef(0)

  const show = useCallback((message: string, undo?: () => void) => {
    setItem({ id: ++seq.current, message, undo })
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
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-border-strong bg-surface py-2 pr-2 pl-4 text-sm"
            >
              <span className="min-w-0">{item.message}</span>
              {item.undo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    item.undo?.()
                    setItem(null)
                  }}
                >
                  Desfazer
                </Button>
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
