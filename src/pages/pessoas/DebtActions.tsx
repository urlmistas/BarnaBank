import { useState } from 'react'
import { Check, Coins, Pencil, Trash2 } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { quickPayment } from '@/lib/finance/mutations'
import { firstName } from '@/lib/format'
import { replaceDebt } from '@/lib/store'
import type { Debt } from '@/lib/types'
import { ConfirmDialog, DebtFormDialog, PartialPayDialog, SettleDialog } from './dialogs'
import { useDebtActions } from './use-debt-actions'

/** Botões de escrita de uma dívida (só aparecem quando os dados são deste aparelho). */
export function DebtActions({ debt, paid }: { debt: Debt; paid: boolean }) {
  const { today, money, baseSettings, canEdit } = useAppData()
  const write = useWrite()
  const { removeDebt } = useDebtActions(debt)
  const [dlg, setDlg] = useState<'partial' | 'settle' | 'edit' | 'delete' | null>(null)
  if (!canEdit) return null

  const pay = debt.kind === 'payable'
  const defWallet = typeof baseSettings.defaultWalletId === 'string' ? baseSettings.defaultWalletId : ''
  const quick = paid ? null : quickPayment(debt, today, defWallet || undefined)

  const doQuick = () => {
    if (!quick) return
    write(
      `${pay ? 'Pago' : 'Recebido'} ${money(quick.amount)}${pay ? ' a ' : ' de '}${firstName(debt.name)}`,
      (api) => replaceDebt(api, debt.id, (d) => ({ ...d, payments: [...d.payments, quick] })),
      'Pagamento desfeito',
    )
  }
  const close = () => setDlg(null)

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
      {quick && (
        <Button size="sm" onClick={doQuick}>
          <Check aria-hidden="true" />
          {pay ? 'Paguei' : 'Recebi'} <span className="num">{money(quick.amount)}</span>
        </Button>
      )}
      {!paid && (
        <Button size="sm" variant="outline" onClick={() => setDlg('partial')}>
          <Coins aria-hidden="true" />
          Só uma parte
        </Button>
      )}
      {!paid && (
        <Button size="sm" variant="ghost" onClick={() => setDlg('settle')}>
          Quitar com desconto
        </Button>
      )}
      <span className="ml-auto flex gap-0.5">
        <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar dívida de ${debt.name}`} title="Editar" onClick={() => setDlg('edit')}>
          <Pencil />
        </Button>
        <Button size="icon" variant="ghost" className="size-8" aria-label={`Excluir dívida de ${debt.name}`} title="Excluir" onClick={() => setDlg('delete')}>
          <Trash2 />
        </Button>
      </span>

      <PartialPayDialog open={dlg === 'partial'} onClose={close} debt={debt} />
      <SettleDialog open={dlg === 'settle'} onClose={close} debt={debt} />
      <DebtFormDialog open={dlg === 'edit'} onClose={close} debt={debt} />
      <ConfirmDialog open={dlg === 'delete'} onClose={close} title="Excluir dívida" okLabel="Excluir" onOk={removeDebt}>
        Excluir a dívida de <b className="text-fg">{debt.name}</b>? Os pagamentos dela também saem. Dá para desfazer logo depois.
      </ConfirmDialog>
    </div>
  )
}
