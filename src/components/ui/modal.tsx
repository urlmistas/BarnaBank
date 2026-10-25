import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Janela de diálogo sobre <dialog> nativo: foco preso, Esc fecha e o fundo não rola.
// Só monta o conteúdo quando aberta, então o estado do formulário recomeça a cada abertura.
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // o conteúdo fica montado até a animação de saída terminar (senão a janela esvazia antes de sumir)
  const [keep, setKeep] = useState(open)
  if (open && !keep) setKeep(true)
  useEffect(() => {
    if (open) return
    const t = window.setTimeout(() => setKeep(false), 220)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        'm-auto max-h-[calc(100dvh-32px)] w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-fg backdrop:bg-black/50',
        className,
      )}
    >
      {(open || keep) && (
        <>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
            <h2 id={titleId} className="min-w-0 truncate text-base font-semibold">
              {title}
            </h2>
            <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}>
              <X />
            </Button>
          </div>
          {children}
        </>
      )}
    </dialog>
  )
}

/** rótulo + controle (o `htmlFor` liga os dois) */
export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-fg-muted">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  )
}
