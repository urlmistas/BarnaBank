import type { Debt, Payment } from '@/lib/types'
import { idbKV, type KV } from './kv'

// Fotos de comprovante de pagamento. A foto fica no IndexedDB do aparelho; no pagamento só vai o `receiptId`.

const DATA_URL = /^data:image\//

export const newReceiptId = () => 'rc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export interface ReceiptStore {
  /** devolve a foto (data URL) ou undefined se não está neste aparelho */
  get(id: string): Promise<string | undefined>
  /** false = só vale nesta sessão (o navegador não deixou gravar) */
  put(id: string, data: string): Promise<boolean>
  remove(id: string): Promise<void>
  /** só as fotos que algum pagamento ainda usa (para o backup) */
  exportUsed(used: Iterable<string>): Promise<Record<string, string>>
  /** devolve quantas fotos entraram; ignora o que não é imagem */
  importAll(obj: unknown): Promise<number>
}

export function createReceiptStore(kv: KV): ReceiptStore {
  const cache = new Map<string, string>()
  return {
    async get(id) {
      const hit = cache.get(id)
      if (hit) return hit
      const data = await kv.get(id)
      if (data) cache.set(id, data)
      return data
    },
    async put(id, data) {
      cache.set(id, data)
      return kv.put(id, data)
    },
    async remove(id) {
      cache.delete(id)
      await kv.del(id)
    },
    async exportUsed(used) {
      const out: Record<string, string> = {}
      for (const id of used) {
        const data = await this.get(id)
        if (data) out[id] = data
      }
      return out
    },
    async importAll(obj) {
      if (!obj || typeof obj !== 'object') return 0
      let n = 0
      for (const [id, data] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof data === 'string' && DATA_URL.test(data)) {
          await this.put(id, data)
          n++
        }
      }
      return n
    },
  }
}

/** o pagamento guarda só o id da foto (o tipo compartilhado `Payment` ainda não declara o campo) */
export type PaymentWithReceipt = Payment & { receiptId?: string }

export const receiptIdOf = (p: Payment | undefined): string | undefined => (p as PaymentWithReceipt | undefined)?.receiptId

/** copia o pagamento com o comprovante trocado (undefined tira o campo) */
export function withReceipt(p: Payment, id: string | undefined): Payment {
  const { receiptId: _old, ...rest } = p as PaymentWithReceipt
  void _old
  return id ? ({ ...rest, receiptId: id } as PaymentWithReceipt) : rest
}

/** ids de comprovante que algum pagamento ainda usa */
export function usedReceiptIds(debts: Pick<Debt, 'payments'>[]): Set<string> {
  const used = new Set<string>()
  for (const d of debts) for (const p of d.payments || []) if (receiptIdOf(p)) used.add(receiptIdOf(p)!)
  return used
}

let shared: ReceiptStore | null = null
/** o armazenamento do app (IndexedDB), criado na primeira vez que alguém usa */
export function receiptStore(): ReceiptStore {
  return (shared ??= createReceiptStore(idbKV()))
}
