import { useCallback, useEffect, useState } from 'react'
import { useWrite } from '@/app/write'
import { useToast } from '@/components/ui/toast'
import { compressImage } from '@/lib/receipts/image'
import { scheduleReceiptCleanup } from '@/lib/receipts/cleanup'
import { newReceiptId, receiptIdOf, receiptStore, withReceipt } from '@/lib/receipts/store'
import { replaceDebt } from '@/lib/store'
import type { Debt } from '@/lib/types'

/** carrega a foto de um comprovante; `undefined` = ainda carregando, `null` = não está neste aparelho */
export function useReceiptImage(receiptId: string | undefined): string | null | undefined {
  const [state, setState] = useState<{ id: string | undefined; data: string | null }>({ id: undefined, data: null })
  useEffect(() => {
    if (!receiptId) return
    let alive = true
    void receiptStore()
      .get(receiptId)
      .then((d) => alive && setState({ id: receiptId, data: d ?? null }))
    return () => {
      alive = false
    }
  }, [receiptId])
  if (!receiptId) return null
  return state.id === receiptId ? state.data : undefined
}

/** anexar, trocar e remover o comprovante de um pagamento (`index` = posição em `debt.payments`) */
export function useReceiptActions(debt: Debt) {
  const write = useWrite()
  const toast = useToast()
  /** comprime, guarda a foto e grava o `receiptId` no pagamento. Devolve true se anexou. */
  const attach = useCallback(
    async (index: number, file: File): Promise<boolean> => {
      let data: string
      try {
        data = await compressImage(file)
      } catch {
        toast.show('Não consegui abrir essa imagem.')
        return false
      }
      const id = receiptIdOf(debt.payments[index]) || newReceiptId()
      const saved = await receiptStore().put(id, data)
      const ok = write(
        saved ? 'Comprovante anexado' : 'Comprovante anexado (só nesta sessão: o navegador não deixou salvar a foto)',
        (api) => replaceDebt(api, debt.id, (d) => ({ ...d, payments: d.payments.map((p, i) => (i === index ? withReceipt(p, id) : p)) })),
        'Anexo desfeito',
      )
      // se foi desfeito, a foto fica órfã: some depois do prazo do "Desfazer"
      scheduleReceiptCleanup(id)
      return ok
    },
    [debt, write, toast],
  )

  const remove = useCallback(
    (index: number): boolean => {
      const id = receiptIdOf(debt.payments[index])
      if (!id) return false
      const ok = write(
        'Comprovante removido',
        (api) => replaceDebt(api, debt.id, (d) => ({ ...d, payments: d.payments.map((p, i) => (i === index ? withReceipt(p, undefined) : p)) })),
        'Comprovante de volta',
      )
      if (ok) scheduleReceiptCleanup(id)
      return ok
    },
    [debt, write],
  )

  return { attach, remove }
}
