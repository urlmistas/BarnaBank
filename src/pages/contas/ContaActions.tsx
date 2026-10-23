import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { deleteBill, deleteCard, deletePurchase, unmarkBill } from '@/lib/finance/contas-mutations'
import type { ContaStatus } from '@/lib/finance/contas'
import type { Bill, Card, YearMonth } from '@/lib/types'
import { ConfirmDialog } from '@/pages/pessoas/dialogs'
import { BillFormDialog, CardFormDialog, PayBillDialog, PayInvoiceDialog, PurchaseDialog } from './dialogs'
import { monthTitle } from './text'

/** Botões de escrita da conta fixa (só com dados deste aparelho). `status` é o do mês aberto; null = a conta não vale no mês. */
export function BillActions({ bill, month, status, padded }: { bill: Bill; month: YearMonth; status: ContaStatus | null; padded: boolean }) {
  const { canEdit } = useAppData()
  const write = useWrite()
  const [dlg, setDlg] = useState<'pay' | 'edit' | 'delete' | null>(null)
  if (!canEdit) return null
  const isIn = bill.kind === 'entrada'
  const close = () => setDlg(null)

  return (
    <div className={padded ? 'px-5' : undefined}>
      <div className="flex flex-wrap items-center gap-1.5">
        {status === 'paga' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              write(`${bill.name}: marcação de ${monthTitle(month)} desfeita`, (api) => void unmarkBill(api, bill.id, month), 'Marcação restaurada')
            }
          >
            <Undo2 aria-hidden="true" />
            Desfazer marcação
          </Button>
        ) : (
          status && (
            <Button size="sm" onClick={() => setDlg('pay')}>
              <Check aria-hidden="true" />
              {isIn ? 'Marcar como recebida' : 'Marcar como paga'}
            </Button>
          )
        )}
        <span className="ml-auto flex gap-0.5">
          <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar conta fixa ${bill.name}`} title="Editar" onClick={() => setDlg('edit')}>
            <Pencil />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label={`Excluir conta fixa ${bill.name}`} title="Excluir" onClick={() => setDlg('delete')}>
            <Trash2 />
          </Button>
        </span>
      </div>

      <PayBillDialog open={dlg === 'pay'} onClose={close} bill={bill} month={month} />
      <BillFormDialog open={dlg === 'edit'} onClose={close} bill={bill} month={month} />
      <ConfirmDialog
        open={dlg === 'delete'}
        onClose={close}
        title="Excluir conta fixa"
        okLabel="Excluir"
        onOk={() => write(`Conta fixa "${bill.name}" excluída`, (api) => deleteBill(api, bill.id), 'Conta fixa restaurada')}
      >
        Excluir a conta fixa <b className="text-fg">{bill.name}</b>? As transações já lançadas nas carteiras continuam lá. Dá para desfazer logo depois.
      </ConfirmDialog>
    </div>
  )
}

/** Botões de escrita do cartão e da fatura aberta. */
export function CardActions({ card, invoiceKey, balance, due, padded }: { card: Card; invoiceKey: YearMonth; balance: number; due: string; padded: boolean }) {
  const { canEdit } = useAppData()
  const write = useWrite()
  const [dlg, setDlg] = useState<'buy' | 'pay' | 'edit' | 'delete' | null>(null)
  if (!canEdit) return null
  const close = () => setDlg(null)

  return (
    <div className={padded ? 'px-5' : undefined}>
      <div className="flex flex-wrap items-center gap-1.5">
        {balance > 0.005 && (
          <Button size="sm" onClick={() => setDlg('pay')}>
            <Check aria-hidden="true" />
            Pagar fatura
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setDlg('buy')}>
          <Plus aria-hidden="true" />
          Compra
        </Button>
        <span className="ml-auto flex gap-0.5">
          <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar cartão ${card.name}`} title="Editar" onClick={() => setDlg('edit')}>
            <Pencil />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label={`Excluir cartão ${card.name}`} title="Excluir" onClick={() => setDlg('delete')}>
            <Trash2 />
          </Button>
        </span>
      </div>

      <PurchaseDialog open={dlg === 'buy'} onClose={close} card={card} />
      <PayInvoiceDialog open={dlg === 'pay'} onClose={close} card={card} invoiceKey={invoiceKey} balance={balance} due={due} />
      <CardFormDialog open={dlg === 'edit'} onClose={close} card={card} />
      <ConfirmDialog
        open={dlg === 'delete'}
        onClose={close}
        title="Excluir cartão"
        okLabel="Excluir"
        onOk={() => write(`Cartão ${card.name} excluído`, (api) => deleteCard(api, card.id), 'Cartão restaurado')}
      >
        Excluir o cartão <b className="text-fg">{card.name}</b> e todas as compras dele? Os pagamentos de fatura já lançados nas carteiras continuam lá. Dá
        para desfazer logo depois.
      </ConfirmDialog>
    </div>
  )
}

/** X ao lado de uma compra na fatura: exclui a compra inteira (todas as parcelas) */
export function DeletePurchaseButton({ purchaseId, label, installments }: { purchaseId: string; label: string; installments: number }) {
  const { canEdit } = useAppData()
  const write = useWrite()
  if (!canEdit) return null
  return (
    <Button
      size="icon"
      variant="ghost"
      className="-mr-2 size-8"
      aria-label={`Excluir compra ${label}`}
      title="Excluir compra"
      onClick={() =>
        write(`Compra "${label}" excluída${installments > 1 ? ' (todas as parcelas)' : ''}`, (api) => deletePurchase(api, purchaseId), 'Compra restaurada')
      }
    >
      <X />
    </Button>
  )
}
