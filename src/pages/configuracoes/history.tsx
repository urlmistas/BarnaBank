import { useState } from 'react'
import { History as HistoryIcon, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { clearHistory, readHistory, undoEntry, type HistoryEntry, type UndoResult } from '@/lib/history'
import { Section } from './layout'

const SHOWN = 30

const MSG: Record<UndoResult, string> = {
  ok: 'Alteração desfeita.',
  changed: 'Não dá para desfazer: o que ela mexeu foi alterado depois.',
  missing: 'Essa alteração não está mais no histórico.',
  big: 'Essa alteração é grande demais para desfazer por aqui.',
  already: 'Essa alteração já foi desfeita.',
  error: 'Não consegui desfazer agora.',
}

function when(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** o que você mudou no app, da mais nova para a mais antiga, com Desfazer (só vale se ninguém mexeu naquilo depois) */
export function HistorySection() {
  const toast = useToast()
  const [list, setList] = useState<HistoryEntry[]>(() => readHistory().reverse())
  const shown = list.slice(0, SHOWN)

  function undo(id: string) {
    toast.show(MSG[undoEntry(id)])
    setList(readHistory().reverse())
  }

  return (
    <Section title="Histórico de alterações" hint="Pagamentos, lançamentos e edições feitos neste aparelho. Só entra o que você faz no app (não o que chega pelo Telegram).">
      {shown.length === 0 ? (
        <p className="flex items-center gap-3 px-4 py-4 text-sm text-fg-muted sm:px-5">
          <HistoryIcon aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
          Nada por aqui ainda. As próximas alterações aparecem nesta lista.
        </p>
      ) : (
        <>
          <ul>
            {shown.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className={e.undone ? 'block truncate text-sm text-fg-subtle line-through' : 'block truncate text-sm'}>{e.msg}</span>
                  <span className="num block text-xs text-fg-subtle">{when(e.at)}</span>
                </span>
                {e.undone ? (
                  <span className="shrink-0 text-xs text-fg-subtle">Desfeita</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={!e.patch} title={e.patch ? undefined : 'Grande demais para desfazer'} aria-label={`Desfazer: ${e.msg}`} onClick={() => undo(e.id)}>
                    <Undo2 aria-hidden="true" />
                    Desfazer
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex justify-end px-4 py-2 sm:px-5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearHistory()
                setList([])
                toast.show('Histórico limpo. Seus dados não mudaram.')
              }}
            >
              Limpar histórico
            </Button>
          </div>
        </>
      )}
    </Section>
  )
}
