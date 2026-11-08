import { describe, expect, it } from 'vitest'
import type { AppData } from '@/lib/types'
import { emptyData } from '@/lib/storage'
import { hasProjects, monthProjects, periodProjects, tagsOf } from './reports'

const data = (p: Partial<AppData>): AppData => ({ ...emptyData(), ...p })

describe('projetos por #etiqueta', () => {
  it('tagsOf: acha as etiquetas, sem repetir e sem diferenciar acento ou caixa', () => {
    expect(tagsOf('jantar #Viagem com #amigos')).toEqual(['Viagem', 'amigos'])
    expect(tagsOf('#viagem #VIAGEM #viágem')).toEqual(['viagem'])
    expect(tagsOf('sem etiqueta')).toEqual([])
    expect(tagsOf(undefined)).toEqual([])
    expect(tagsOf('cor #fff, item #1 e ação #ação-2')).toEqual(['fff', '1', 'ação-2'])
  })

  const dt = data({
    transactions: [
      { id: '1', walletId: 'a', type: 'gasto', amount: 100, date: '2026-03-02', category: 'Mercado', note: 'compras #viagem' },
      { id: '2', walletId: 'a', type: 'gasto', amount: 50, date: '2026-03-03', category: 'Lazer', note: 'cinema #viagem #amigos' },
      { id: '3', walletId: 'a', type: 'gasto', amount: 70, date: '2026-03-04', category: 'Lazer', note: 'sem etiqueta' },
      { id: '4', walletId: 'a', type: 'entrada', amount: 900, date: '2026-03-05', note: 'salário #viagem' },
      { id: '5', walletId: 'a', type: 'gasto', amount: 30, date: '2026-03-06', note: 'fatura #viagem', auto: 'card:x' },
      { id: '6', walletId: 'a', type: 'gasto', amount: 20, date: '2026-02-10', note: 'hotel #Viagem' },
    ],
    cardPurchases: [{ id: 'p1', cardId: 'c', amount: 300, date: '2026-03-01', installments: 3, note: 'passagem #viagem' }],
  })

  it('soma por projeto no mês: gasto com duas etiquetas conta nas duas; entrada, fatura paga e sem etiqueta não contam', () => {
    const m = monthProjects(dt, '2026-03')
    expect(m.byCat['viagem']).toMatchObject({ name: 'viagem', amount: 250, card: 100 }) // 100 + 50 + parcela 100 do cartão
    expect(m.byCat['amigos'].amount).toBe(50)
  })

  it('parcelas do cartão caem nos meses seguintes; período soma os meses', () => {
    expect(monthProjects(dt, '2026-04').byCat['viagem']).toMatchObject({ amount: 100, card: 100 })
    const p = periodProjects(dt, ['2026-02', '2026-03'])
    expect(p.byCat['viagem'].amount).toBe(270) // 20 (fev, "Viagem") + 250
  })

  it('hasProjects só é verdade se existe etiqueta em gasto ou compra no cartão', () => {
    expect(hasProjects(dt)).toBe(true)
    expect(hasProjects(data({ transactions: [{ id: 'x', walletId: 'a', type: 'entrada', amount: 1, date: '2026-03-01', note: '#a' }] }))).toBe(false)
    expect(hasProjects(data({}))).toBe(false)
  })
})
