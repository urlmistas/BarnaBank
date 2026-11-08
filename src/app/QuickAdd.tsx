import { useState } from 'react'
import { ArrowLeftRight, HandCoins, Plus, ReceiptText } from 'lucide-react'
import { Menu } from '@/components/ui/menu'
import { TxFormDialog } from '@/pages/carteiras/dialogs'
import { DebtFormDialog } from '@/pages/pessoas/dialogs'
import { useAppData } from './data-context'

type Dlg = 'tx' | 'lent' | 'owe' | null

/**
 * Botão "+" flutuante do celular (acima da barra de baixo): lança um gasto ou entrada, ou uma dívida, de qualquer tela.
 * Só aparece quando os dados são deste aparelho (mesma regra dos botões de criar).
 */
export function QuickAdd() {
  const { canCreate, canEdit, result } = useAppData()
  const [dlg, setDlg] = useState<Dlg>(null)
  if (!canCreate) return null
  const hasWallets = (result?.data.wallets.length ?? 0) > 0
  const close = () => setDlg(null)
  return (
    <>
      <div className="fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-30 md:hidden">
        <Menu
          label="Adicionar"
          trigger={<Plus aria-hidden="true" className="size-5!" />}
          className="size-12 rounded-[14px] border-0 bg-accent text-white shadow-lg hover:bg-accent hover:text-white hover:brightness-110"
          items={[
            { label: 'Gasto ou entrada', icon: <ArrowLeftRight aria-hidden="true" />, onSelect: () => setDlg('tx'), hidden: !canEdit || !hasWallets },
            { label: 'Emprestei a alguém', icon: <HandCoins aria-hidden="true" />, onSelect: () => setDlg('lent') },
            { label: 'Devo a alguém', icon: <ReceiptText aria-hidden="true" />, onSelect: () => setDlg('owe') },
          ]}
        />
      </div>
      {dlg === 'tx' && <TxFormDialog open onClose={close} />}
      {dlg === 'lent' && <DebtFormDialog open onClose={close} kind="receivable" />}
      {dlg === 'owe' && <DebtFormDialog open onClose={close} kind="payable" />}
    </>
  )
}
