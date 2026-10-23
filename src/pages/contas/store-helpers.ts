import type { StoreApi } from '@/lib/store'
import type { Bill, Card } from '@/lib/types'

// Trocas por id nas listas de Contas (o store.ts só traz `replaceDebt`, que é de dívidas).
export function replaceBill(api: Pick<StoreApi, 'bills'>, id: string, fn: (b: Bill) => Bill) {
  api.bills = api.bills.map((b) => (b.id === id ? fn(b) : b))
}

export function replaceCard(api: Pick<StoreApi, 'cards'>, id: string, fn: (c: Card) => Card) {
  api.cards = api.cards.map((c) => (c.id === id ? fn(c) : c))
}
