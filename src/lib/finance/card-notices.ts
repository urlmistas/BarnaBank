import type { AppData, Card, ISODate, YearMonth } from '@/lib/types'
import { addDaysISO, daysBetweenISO, EPS } from './dates'
import { cardInvoices, invoiceKeyFor } from './bills-cards'
import { cardRouteId } from './contas'

// Avisos das faturas de cartão: a fatura aberta que fecha em poucos dias (com o melhor dia de compra) e a fechada que
// vence em poucos dias ou já venceu. Só olha o que o app já guarda: dia de fechamento, dia de vencimento e as compras.

export type CardNoticeKind = 'closing' | 'due' | 'late'

export interface CardNotice {
  kind: CardNoticeKind
  card: Card
  /** dias até fechar/vencer (negativo = dias de atraso) */
  days: number
  /** fatura do aviso (AAAA-MM) */
  key: YearMonth
  /** quanto falta pagar (vencimento e atraso) ou quanto a fatura tem até agora (fechamento) */
  amount: number
  /** só no fechamento: primeiro dia em que a compra já cai na fatura seguinte (mais prazo para pagar) */
  bestDay?: ISODate
  /** rota da fatura */
  to: string
}

const SOON = 3
const order: Record<CardNoticeKind, number> = { late: 0, due: 1, closing: 2 }

export function cardNotices(data: Pick<AppData, 'cards' | 'cardPurchases' | 'cardPayments'>, today: ISODate): CardNotice[] {
  const out: CardNotice[] = []
  for (const card of data.cards) {
    const invs = cardInvoices(data, card, today)
    const to = (key: YearMonth) => `/contas/${cardRouteId(card.id)}?m=${key}`
    // fatura que ainda recebe compras e fecha em até 3 dias
    const open = invs.get(invoiceKeyFor(card, today))
    if (open.status === 'aberta' && (open.total ?? 0) > EPS && open.close) {
      const days = daysBetweenISO(today, open.close)
      if (days >= 0 && days <= SOON) {
        out.push({ kind: 'closing', card, days, key: open.key, amount: open.total ?? 0, bestDay: addDaysISO(open.close, 1), to: to(open.key) })
      }
    }
    // faturas fechadas com saldo: vencendo em até 3 dias ou vencidas
    let late: CardNotice | null = null
    for (const key of Object.keys(invs.map).sort()) {
      const inv = invs.get(key)
      if (!inv.due || (inv.balance ?? 0) <= EPS) continue
      // o saldo vencido passa para a fatura seguinte: avisa só da mais recente vencida de cada cartão
      if (inv.status === 'atrasada') late = { kind: 'late', card, days: daysBetweenISO(today, inv.due), key, amount: inv.balance ?? 0, to: to(key) }
      else if (inv.status === 'fechada') {
        const days = daysBetweenISO(today, inv.due)
        if (days >= 0 && days <= SOON) out.push({ kind: 'due', card, days, key, amount: inv.balance ?? 0, to: to(key) })
      }
    }
    if (late) out.push(late)
  }
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.days - b.days || a.card.name.localeCompare(b.card.name, 'pt-BR'))
}
