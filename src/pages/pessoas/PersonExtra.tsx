import { useState } from 'react'
import { ShieldCheck, Tag, Pencil } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { EPS } from '@/lib/finance/dates'
import { notesOf, tagsOf } from '@/lib/finance/person-extra'
import { trustInfo, type Trust } from '@/lib/finance/trust'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TagsDialog } from './dialogs-extra'

const TONE: Record<Trust['cls'], string> = {
  great: 'text-pos',
  good: 'text-pos',
  mid: 'text-fg',
  bad: 'text-neg',
}

/** Nota de confiança, etiquetas e notas da pessoa. */
export function PersonExtra({ personKey, name }: { personKey: string; name: string }) {
  const { result, today, money, canEdit } = useAppData()
  const [editing, setEditing] = useState(false)
  const contact = result?.data.contacts[personKey]
  const tags = tagsOf(contact)
  const notes = notesOf(contact)
  const t = trustInfo(result?.data.debts ?? [], personKey, today)

  return (
    <section aria-label={`Confiança e anotações de ${name}`} className="mt-3 flex flex-col gap-3 rounded-md border border-border px-4 py-3">
      {t ? <TrustLine t={t} money={money} /> : <NoTrust />}
      {(tags.length > 0 || notes || canEdit) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-fg-muted">
              <Tag aria-hidden="true" className="size-3" />
              {tag}
            </span>
          ))}
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditing(true)}>
              {tags.length || notes ? <Pencil aria-hidden="true" /> : <Tag aria-hidden="true" />}
              {tags.length || notes ? 'Editar' : 'Etiquetas e notas'}
            </Button>
          )}
        </div>
      )}
      {notes && <p className="text-xs whitespace-pre-line text-fg-muted">{notes}</p>}
      {canEdit && <TagsDialog open={editing} onClose={() => setEditing(false)} personKey={personKey} name={name} />}
    </section>
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
