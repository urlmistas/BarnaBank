import { useState } from 'react'
import { Check, Coins, FileText, Pencil, Receipt, Trash2 } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { quickPayment } from '@/lib/finance/mutations'
import { firstName } from '@/lib/format'
import { canIssueReceipt, receiptHtml, statementHtml } from '@/lib/print/documents'
import { openPrintWindow } from '@/lib/print/html'
import { useDocCtx } from '@/lib/print/use-doc-ctx'
import { replaceDebt } from '@/lib/store'
import type { Debt } from '@/lib/types'
import { ConfirmDialog, DebtFormDialog, PartialPayDialog, SettleDialog } from './dialogs'
import { useDebtActions } from './use-debt-actions'

const BLOCKED = 'Seu navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.'

/**
 * Botões de uma dívida. Extrato e recibo (só leitura) aparecem sempre;
 * pagar, editar e excluir só quando os dados são deste aparelho.
 */
export function DebtActions({ debt, paid }: { debt: Debt; paid: boolean }) {
  const { today, money, baseSettings, canEdit, result } = useAppData()
  const write = useWrite()
  const toast = useToast()
  const doc = useDocCtx()
  const { removeDebt } = useDebtActions(debt)
  const [dlg, setDlg] = useState<'partial' | 'settle' | 'edit' | 'delete' | null>(null)

  const pay = debt.kind === 'payable'
  const defWallet = typeof baseSettings.defaultWalletId === 'string' ? baseSettings.defaultWalletId : ''
  const quick = canEdit && !paid ? quickPayment(debt, today, defWallet || undefined) : null
  const receipt = canIssueReceipt(debt, today)
  const groupTitle = debt.groupId ? result?.data.groups.find((g) => g.id === debt.groupId)?.title : undefined

  const doQuick = () => {
    if (!quick) return
    write(
      `${pay ? 'Pago' : 'Recebido'} ${money(quick.amount)}${pay ? ' a ' : ' de '}${firstName(debt.name)}`,
      (api) => replaceDebt(api, debt.id, (d) => ({ ...d, payments: [...d.payments, quick] })),
      'Pagamento desfeito',
    )
  }
  const print = (html: string) => {
    if (!openPrintWindow(html)) toast.show(BLOCKED)
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
      {canEdit && !paid && (
        <Button size="sm" variant="outline" onClick={() => setDlg('partial')}>
          <Coins aria-hidden="true" />
          Só uma parte
        </Button>
      )}
      {canEdit && !paid && (
        <Button size="sm" variant="ghost" onClick={() => setDlg('settle')}>
          Quitar com desconto
        </Button>
      )}
      {receipt && (
        <Button size="sm" variant={paid ? 'default' : 'outline'} onClick={() => print(receiptHtml(debt, { ...doc, issuedAt: new Date() }, groupTitle))}>
          <Receipt aria-hidden="true" />
          Recibo de quitação
        </Button>
      )}
      <span className="ml-auto flex gap-0.5">
        <Button size="sm" variant="ghost" onClick={() => print(statementHtml(debt, { ...doc, issuedAt: new Date() }))}>
          <FileText aria-hidden="true" />
          Extrato
        </Button>
        {canEdit && (
          <>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar dívida de ${debt.name}`} title="Editar" onClick={() => setDlg('edit')}>
              <Pencil />
            </Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Excluir dívida de ${debt.name}`} title="Excluir" onClick={() => setDlg('delete')}>
              <Trash2 />
            </Button>
          </>
        )}
      </span>

      {canEdit && (
        <>
          <PartialPayDialog open={dlg === 'partial'} onClose={close} debt={debt} />
          <SettleDialog open={dlg === 'settle'} onClose={close} debt={debt} />
          <DebtFormDialog open={dlg === 'edit'} onClose={close} debt={debt} />
          <ConfirmDialog open={dlg === 'delete'} onClose={close} title="Excluir dívida" okLabel="Excluir" onOk={removeDebt}>
            Excluir a dívida de <b className="text-fg">{debt.name}</b>? Os pagamentos dela também saem. Dá para desfazer logo depois.
          </ConfirmDialog>
        </>
      )}
    </div>
  )
}
