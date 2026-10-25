import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Peças de layout compartilhadas pelas seções de Configurações.

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="px-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
        {title}
      </h3>
      {hint && <p className="mt-0.5 px-1 text-xs text-fg-muted">{hint}</p>}
      <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">{children}</div>
    </section>
  )
}

/** linha: rótulo e explicação à esquerda, controle à direita (no celular, controle embaixo) */
export function Row({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  const L = htmlFor ? 'label' : 'p'
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <L {...(htmlFor ? { htmlFor } : {})} className="block text-sm font-medium">
          {label}
        </L>
        {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** interruptor liga/desliga (role=switch) */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-0.5 left-0.5 size-4.5 rounded-full shadow-sm transition-transform motion-reduce:transition-none',
          checked ? 'translate-x-5 bg-accent-fg' : 'bg-fg-muted',
        )}
      />
    </button>
  )
}

/** tecla do teclado */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-border-strong border-b-2 bg-surface-2 px-1.5 font-sans text-xs font-medium text-fg">
      {children}
    </kbd>
  )
}
