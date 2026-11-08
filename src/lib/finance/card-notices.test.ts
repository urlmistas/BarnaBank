import { describe, expect, it } from 'vitest'
import type { AppData } from '@/lib/types'
import { cardNotices } from './card-notices'

const card = { id: 'c1', name: 'Nubank', closingDay: 10, dueDay: 17, limit: 1000 }
const data = (over: Partial<AppData> = {}) =>
  ({
    cards: [card],
    cardPurchases: [{ id: 'p1', cardId: 'c1', amount: 200, date: '2026-11-03', installments: 1 }],
    cardPayments: [],
    ...over,
  }) as unknown as Pick<AppData, 'cards' | 'cardPurchases' | 'cardPayments'>

describe('avisos de fatura do cartão', () => {
  it('fatura aberta que fecha em até 3 dias: avisa com o melhor dia de compra (o dia seguinte ao fechamento)', () => {
    const n = cardNotices(data(), '2026-11-08')
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ kind: 'closing', days: 2, amount: 200, bestDay: '2026-11-11', key: '2026-11' })
    expect(n[0].to).toBe('/contas/cartao-c1?m=2026-11')
  })

  it('longe do fechamento não avisa', () => {
    expect(cardNotices(data(), '2026-11-04')).toEqual([])
  })

  it('fatura vazia não avisa do fechamento', () => {
    expect(cardNotices(data({ cardPurchases: [] }), '2026-11-08')).toEqual([])
  })

  it('fechada e vencendo em até 3 dias: avisa o que falta pagar', () => {
    const n = cardNotices(data(), '2026-11-15')
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ kind: 'due', days: 2, amount: 200 })
  })

  it('vence hoje também avisa (0 dias)', () => {
    expect(cardNotices(data(), '2026-11-17')[0]).toMatchObject({ kind: 'due', days: 0 })
  })

  it('depois do vencimento: atrasada, com os dias de atraso negativos', () => {
    const n = cardNotices(data(), '2026-11-20')
    expect(n[0]).toMatchObject({ kind: 'late', days: -3, amount: 200 })
  })

  it('fatura paga não avisa', () => {
    const d = data({ cardPayments: [{ id: 'x', cardId: 'c1', amount: 200, date: '2026-11-14', invoice: '2026-11' }] as never })
    expect(cardNotices(d, '2026-11-15')).toEqual([])
  })

  it('só uma atrasada por cartão e as atrasadas vêm antes das que vencem', () => {
    const d = data({
      cards: [card, { id: 'c2', name: 'Inter', closingDay: 25, dueDay: 2, limit: 500 }] as never,
      cardPurchases: [
        { id: 'p1', cardId: 'c1', amount: 200, date: '2026-09-03', installments: 1 },
        { id: 'p2', cardId: 'c1', amount: 90, date: '2026-10-03', installments: 1 },
        { id: 'p3', cardId: 'c2', amount: 50, date: '2026-10-20', installments: 1 },
      ] as never,
    })
    const n = cardNotices(d, '2026-11-20')
    expect(n.filter((x) => x.card.id === 'c1' && x.kind === 'late')).toHaveLength(1)
    expect(n[0].kind).toBe('late')
  })
})
