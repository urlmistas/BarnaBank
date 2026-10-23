import { Download, ImageOff, RefreshCw, Trash2 } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { normTxt } from '@/lib/finance/people'
import { firstName } from '@/lib/format'
import { receiptIdOf } from '@/lib/receipts/store'
import type { Debt } from '@/lib/types'
import { useReceiptImage } from './use-receipts'

/** Ver o comprovante de um pagamento; trocar e remover só com dados deste aparelho. */
export function ReceiptDialog({ debt, index, onClose, onSwap, onRemove }: {
  debt: Debt
  index: number
  onClose: () => void
  onSwap: () => void
  onRemove: () => void
}) {
  const { money, date, canEdit } = useAppData()
  const p = debt.payments[index]
  return (
    <Modal open onClose={onClose} title={p ? `Comprovante · ${money(p.amount)} em ${date(p.date)}` : 'Comprovante'}>
      {p && <Body debt={debt} index={index} canEdit={canEdit} onClose={onClose} onSwap={onSwap} onRemove={onRemove} />}
    </Modal>
  )
}

function Body({ debt, index, canEdit, onClose, onSwap, onRemove }: {
  debt: Debt
  index: number
  canEdit: boolean
  onClose: () => void
  onSwap: () => void
  onRemove: () => void
}) {
  const p = debt.payments[index]
  const data = useReceiptImage(receiptIdOf(p))
  const download = () => {
    if (!data) return
    const a = document.createElement('a')
    a.href = data
    a.download = `comprovante-${normTxt(firstName(debt.name)).replace(/[^a-z0-9]+/g, '-')}-${p.date}.jpg`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  return (
    <div className="px-5 py-4">
      {data === undefined && <Skeleton className="h-64 w-full rounded-md" />}
      {data === null && (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
          <ImageOff aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
          Esta foto não está neste aparelho (ela foi anexada em outro lugar).
        </div>
      )}
      {data && <img src={data} alt="Comprovante do pagamento" className="max-h-[60dvh] w-full rounded-md border border-border object-contain" />}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => (onClose(), onSwap())}>
            <RefreshCw aria-hidden="true" />
            Trocar
          </Button>
        )}
        {data && (
          <Button variant="ghost" size="sm" onClick={download}>
            <Download aria-hidden="true" />
            Baixar
          </Button>
        )}
        {canEdit && (
          <Button variant="ghost" size="sm" className="ml-auto text-neg" onClick={() => (onClose(), onRemove())}>
            <Trash2 aria-hidden="true" />
            Remover
          </Button>
        )}
      </div>
    </div>
  )
}
