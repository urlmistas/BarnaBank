import { STORAGE_KEY } from '@/lib/storage'
import { receiptStore, usedReceiptIds, type ReceiptStore } from './store'

/** ids de comprovante usados pelas dívidas gravadas agora no armazenamento (só leitura) */
export function usedIdsInStorage(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Set<string> {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    const debts = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? (parsed as { debts?: unknown }).debts : []
    return usedReceiptIds(Array.isArray(debts) ? (debts as { payments?: { receiptId?: string }[] }[]).map((d) => ({ payments: (d.payments ?? []) as never })) : [])
  } catch {
    return new Set()
  }
}

/**
 * Passado o tempo do "Desfazer", apaga a foto se nenhum pagamento a usa mais.
 * (Remover o comprovante ou desfazer o anexo deixa a foto órfã.)
 */
export function scheduleReceiptCleanup(id: string, delayMs = 9000, store: ReceiptStore = receiptStore(), used = usedIdsInStorage) {
  return setTimeout(() => {
    if (!used().has(id)) void store.remove(id)
  }, delayMs)
}
