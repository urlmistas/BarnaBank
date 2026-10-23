import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

/**
 * "Qual versão manter?": aparelho e conta mudaram desde a última sincronização.
 * Fechar sem escolher deixa a pendência para depois (nada é trocado nem enviado).
 */
export function SyncConflictDialog() {
  const { conflict, conflictOpen, setConflictOpen, resolveConflict, date } = useAppData()
  const when = conflict?.updated_at ? date(conflict.updated_at.slice(0, 10)) : ''
  return (
    <Modal open={!!conflict && conflictOpen} onClose={() => setConflictOpen(false)} title="Qual versão manter?">
      <div className="px-5 py-4">
        <p className="text-sm text-fg-muted">
          Este aparelho tem dados que a sua conta ainda não tem, ou a conta foi alterada em outro aparelho{when && <> (em <span className="num">{when}</span>)</>}.
          Escolha qual versão vale. A outra é substituída.
        </p>
        <p className="mt-2 text-xs text-fg-subtle">
          Se usar a da conta, o que havia aqui fica guardado como cópia de segurança neste navegador.
        </p>
        <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <Button variant="ghost" onClick={() => setConflictOpen(false)}>
            Decidir depois
          </Button>
          <Button variant="outline" onClick={() => void resolveConflict(false)}>
            Manter deste aparelho
          </Button>
          <Button onClick={() => void resolveConflict(true)}>Usar os da conta</Button>
        </div>
      </div>
    </Modal>
  )
}
