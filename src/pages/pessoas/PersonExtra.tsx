import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil, ShieldCheck, Tag } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { EPS } from '@/lib/finance/dates'
import { notesOf, tagsOf } from '@/lib/finance/person-extra'
import { trustInfo, type Trust } from '@/lib/finance/trust'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TagsDialog } from './dialogs-extra'
import { personHref } from './links'

const TONE: Record<Trust['cls'], string> = {
  great: 'text-pos',
  good: 'text-pos',
  mid: 'text-fg',
  bad: 'text-neg',
}

/** Nota de confiança da pessoa (e a sugestão de quanto emprestar). */
export function TrustSummary({ personKey }: { personKey: string }) {
  const { result, today, money } = useAppData()
  const t = trustInfo(result?.data.debts ?? [], personKey, today)
  return t ? <TrustLine t={t} money={money} /> : <NoTrust />
}

/** Etiquetas e anotações da pessoa; não mostra nada se não houver. */
export function TagsNotes({ personKey, className }: { personKey: string; className?: string }) {
  const { result } = useAppData()
  const contact = result?.data.contacts[personKey]
  const tags = tagsOf(contact)
  const notes = notesOf(contact)
  if (!tags.length && !notes) return null
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-fg-muted">
              <Tag aria-hidden="true" className="size-3" />
              {tag}
            </span>
          ))}
        </div>
      )}
      {notes && <p className="text-xs whitespace-pre-line text-fg-muted">{notes}</p>}
    </div>
  )
}

/** Lápis ao lado do nome: abre a edição da pessoa (nome, telefone, etiquetas e notas). */
export function EditPersonButton({ personKey, name }: { personKey: string; name: string }) {
  const { canEdit } = useAppData()
  const [editing, setEditing] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  if (!canEdit) return null
  return (
    <>
      <Tooltip label="Editar pessoa">
        <Button size="icon" variant="ghost" aria-label="Editar pessoa" className="size-8" onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" />
        </Button>
      </Tooltip>
      <TagsDialog
        open={editing}
        onClose={() => setEditing(false)}
        personKey={personKey}
        name={name}
        onRenamed={(k) => navigate(personHref(k, params.toString()), { replace: true })}
      />
    </>
  )
}

function NoTrust() {
  return (
    <div className="flex items-start gap-2.5 text-xs text-fg-muted">
      <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
      <p>
        <b className="font-medium text-fg">Confiança: sem histórico ainda.</b> A nota aparece depois da primeira parcela vencida.
      </p>
    </div>
  )
}

function TrustLine({ t, money }: { t: Trust; money: (v: number) => string }) {
  const r = t.rel
  const how =
    t.score >= 85 ? '1,5x o maior empréstimo que já quitou' : t.score >= 70 ? 'o mesmo que o maior empréstimo que já quitou' : 'metade do maior empréstimo que já quitou'
  const tip = t.limit
    ? `Sugestão: emprestar até ${money(t.limit)} (${t.hasDone ? how : 'com base no que já pagou'}).`
    : t.lateNow > EPS
      ? 'Melhor não emprestar até acertar o atrasado.'
      : 'Melhor não emprestar por enquanto.'
  return (
    <div className="flex items-start gap-3">
      <span
        role="img"
        aria-label={`Nota ${t.score} de 100`}
        className={cn('num grid size-11 shrink-0 place-items-center rounded-full border-2 border-current text-sm font-semibold', TONE[t.cls])}
      >
        {t.score}
      </span>
      <div className="min-w-0 text-xs">
        <p className={cn('text-sm font-medium', TONE[t.cls])}>Confiança {t.label.toLowerCase()}</p>
        <p className="mt-0.5 text-fg-muted">
          Pagou em dia {r.onTime} de {plural(r.total, 'parcela', 'parcelas')}
          {r.late > 0 && ` · atraso médio de ${plural(r.avgDelay, 'dia', 'dias')} · maior ${plural(t.maxDelay, 'dia', 'dias')}`}
          {t.lateNow > EPS && <em className="text-neg not-italic"> · {money(t.lateNow)} atrasado agora</em>}
        </p>
        <p className="mt-0.5 text-fg-subtle">{tip}</p>
      </div>
    </div>
  )
}
