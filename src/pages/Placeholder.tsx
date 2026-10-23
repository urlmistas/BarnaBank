import { Link } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Abas ainda não portadas do app antigo (ver MIGRATION.md). */
export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <section aria-labelledby="ph-titulo" className="max-w-xl">
      <h1 id="ph-titulo" className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <div className="mt-6 rounded-lg border border-dashed border-border px-5 py-8">
        <Hammer aria-hidden="true" className="size-5 text-fg-subtle" />
        <p className="mt-3 text-base font-medium">Em redesenho</p>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
        <p className="mt-1 text-sm text-fg-muted">Enquanto isso, use esta seção no BarnaBank atual — os dados são os mesmos.</p>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link to="/">Voltar ao Início</Link>
        </Button>
      </div>
    </section>
  )
}
