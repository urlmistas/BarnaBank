import { useState } from 'react'
import { CalendarClock, Check, Coins, Ellipsis, FileText, Handshake, Laugh, MessageCircle, Pencil, Percent, Receipt, Trash2 } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast'
import { quickPayment } from '@/lib/finance/mutations'
import { firstName } from '@/lib/format'
import { canIssueReceipt, receiptHtml, statementHtml } from '@/lib/print/documents'
import { openPrintWindow } from '@/lib/print/html'
import { useDocCtx } from '@/lib/print/use-doc-ctx'
import { replaceDebt } from '@/lib/store'
import type { Debt } from '@/lib/types'
import { funnyReceipt } from '@/lib/finance/comedy'
import { whatsPhone, whatsappLink } from '@/lib/finance/whatsapp'
import { nameKey } from '@/lib/finance/people'
import { chargeLinkFor } from './charge-link'
import { ConfirmDialog, DebtFormDialog, PartialPayDialog, SettleDialog } from './dialogs'
import { ExtendDialog, RenegDialog } from './dialogs-extra'
import { useDebtActions } from './use-debt-actions'
import { ShareButton } from './share-dialog'

const BLOCKED = 'Seu navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.'

/**
 * Ações de uma dívida: o pagamento rápido, a cobrança (WhatsApp e link) e um menu "Mais ações" com o resto.
 * Pagar, editar e excluir só aparecem quando os dados são deste aparelho; extrato e recibo, sempre.
 */
export function DebtActions({ debt, paid }: { debt: Debt; paid: boolean }) {
  const { today, money, date, baseSettings, canEdit, result } = useAppData()
  const write = useWrite()
  const toast = useToast()
  const doc = useDocCtx()
  const { removeDebt } = useDebtActions(debt)
  const [dlg, setDlg] = useState<'partial' | 'settle' | 'edit' | 'delete' | 'extend' | 'reneg' | null>(null)

  const pay = debt.kind === 'payable'
  const defWallet = typeof baseSettings.defaultWalletId === 'string' ? baseSettings.defaultWalletId : ''
  const quick = canEdit && !paid ? quickPayment(debt, today, defWallet || undefined) : null
  const receipt = canIssueReceipt(debt, today)
  const groupTitle = debt.groupId ? result?.data.groups.find((g) => g.id === debt.groupId)?.title : undefined

  // WhatsApp: só para quem me deve; sem telefone cadastrado, o botão avisa onde cadastrar
  const contact = result?.data.contacts[nameKey(debt.name)]
  const wa = !pay && !paid
  const waHref = wa
    ? whatsappLink(debt, contact, {
        today, money, date, groupTitle,
        pixKey: typeof baseSettings.pixKey === 'string' ? baseSettings.pixKey : undefined,
        link: chargeLinkFor(debt),
      })
    : null
  // "Confirmar ao excluir" desligado nas Configurações: exclui direto e só oferece Desfazer
  const askDelete = baseSettings.confirmDelete !== false

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
  const pixKey = typeof baseSettings.pixKey === 'string' ? baseSettings.pixKey : undefined
  // comprovante de brincadeira: sempre copia; com telefone cadastrado, abre o WhatsApp já com o texto
  const funny = async () => {
    const text = funnyReceipt(debt, { today, money, date, pixKey })
    let copied = false
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      /* sem permissão da área de transferência: segue só com o WhatsApp, se houver */
    }
    const phone = whatsPhone(contact)
    if (phone) {
      const w = window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank')
      if (w) w.opener = null
      else toast.show(copied ? 'Comprovante copiado. Seu navegador bloqueou o WhatsApp.' : BLOCKED)
    } else toast.show(copied ? 'Comprovante copiado. Cole na conversa.' : 'Não consegui copiar o comprovante.')
  }
  const close = () => setDlg(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {quick && (
        <Button size="sm" onClick={doQuick}>
          <Check aria-hidden="true" />
          {pay ? 'Paguei' : 'Recebi'} <span className="num">{money(quick.amount)}</span>
        </Button>
      )}
      {receipt && paid && (
        <Button size="sm" onClick={() => print(receiptHtml(debt, { ...doc, issuedAt: new Date() }, groupTitle))}>
          <Receipt aria-hidden="true" />
          Recibo de quitação
        </Button>
      )}
      {wa &&
        (waHref ? (
          <Button asChild size="sm" variant="outline">
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" />
              WhatsApp
              <span className="sr-only">(abre em outra aba)</span>
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => toast.show('Cadastre o telefone em "Editar" para cobrar pelo WhatsApp.')}>
            <MessageCircle aria-hidden="true" />
            WhatsApp
          </Button>
        ))}
      {!paid && <ShareButton type="debt" refKey={debt.id} label={debt.name} variant="outline" />}
      <Menu
        className="ml-auto"
        label="Mais ações"
        trigger={<Ellipsis aria-hidden="true" />}
        items={[
          { label: 'Comprovante engraçado', icon: <Laugh aria-hidden="true" />, hidden: pay || paid, onSelect: funny },
          { label: 'Só uma parte', icon: <Coins aria-hidden="true" />, hidden: !canEdit || paid, onSelect: () => setDlg('partial') },
          { label: 'Quitar com desconto', icon: <Percent aria-hidden="true" />, hidden: !canEdit || paid, onSelect: () => setDlg('settle') },
          { label: 'Mais prazo', icon: <CalendarClock aria-hidden="true" />, hidden: !canEdit || paid, onSelect: () => setDlg('extend') },
          { label: 'Renegociar', icon: <Handshake aria-hidden="true" />, hidden: !canEdit || paid || !!debt.recurring, onSelect: () => setDlg('reneg') },
          { label: 'Recibo de quitação', icon: <Receipt aria-hidden="true" />, hidden: !receipt || paid, onSelect: () => print(receiptHtml(debt, { ...doc, issuedAt: new Date() }, groupTitle)) },
          { label: 'Extrato', icon: <FileText aria-hidden="true" />, onSelect: () => print(statementHtml(debt, { ...doc, issuedAt: new Date() })) },
          { label: 'Editar', icon: <Pencil aria-hidden="true" />, hidden: !canEdit, onSelect: () => setDlg('edit') },
          { label: 'Excluir', icon: <Trash2 aria-hidden="true" />, danger: true, hidden: !canEdit, onSelect: () => (askDelete ? setDlg('delete') : removeDebt()) },
        ]}
      />

      {canEdit && (
        <>
          <PartialPayDialog open={dlg === 'partial'} onClose={close} debt={debt} />
          <SettleDialog open={dlg === 'settle'} onClose={close} debt={debt} />
          <ExtendDialog open={dlg === 'extend'} onClose={close} debt={debt} />
          <RenegDialog open={dlg === 'reneg'} onClose={close} debt={debt} />
          <DebtFormDialog open={dlg === 'edit'} onClose={close} debt={debt} />
          <ConfirmDialog open={dlg === 'delete'} onClose={close} title="Excluir dívida" okLabel="Excluir" onOk={removeDebt}>
            Excluir a dívida de <b className="text-fg">{debt.name}</b>? Os pagamentos dela também saem. Dá para desfazer logo depois.
          </ConfirmDialog>
        </>
      )}
    </div>
  )
}
