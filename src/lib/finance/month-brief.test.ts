import { describe, expect, it } from 'vitest'
import type { AppData, Bill } from '@/lib/types'
import { emptyData } from '@/lib/storage'
import { briefHeadline, monthBrief } from './month-brief'

const TODAY = '2026-10-15'
const money = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
const conta = (id: string, name: string, amount: number, dueDay: number, kind: Bill['kind'] = 'gasto'): Bill => ({
  id, name, amount, kind, dueDay, paid: {}, startMonth: '2026-10',
})
const base = (saldo: number, bills: Bill[]): AppData => ({
  ...emptyData(),
  wallets: [{ id: 'w', name: 'Inter', icon: 'landmark' }],
  transactions: [{ id: 't', walletId: 'w', type: 'entrada', amount: saldo, date: '2026-10-01' }],
  bills,
})

describe('monthBrief', () => {
  it('sem carteira, avisa para cadastrar', () => {
    const b = monthBrief({ ...emptyData(), bills: [conta('a', 'Luz', 100, 20)] }, TODAY)
    expect(b.verdict).toBe('empty')
    expect(briefHeadline(b, money)).toBe('Cadastre uma carteira para ver a previsão do mês.')
  })

  it('cabe com folga e calcula o que sobra por dia', () => {
    const b = monthBrief(base(1000, [conta('a', 'Luz', 100, 20), conta('b', 'Internet', 100, 25)]), TODAY)
    expect(b.verdict).toBe('ok')
    expect(b.outTotal).toBe(200)
    expect(b.endBalance).toBe(800)
    expect(b.daysLeft).toBe(16)
    expect(b.perDay).toBe(47.06)
    expect(b.shortfall).toBeNull()
    expect(briefHeadline(b, money)).toBe('Cabe com folga: sobram R$ 800,00 no fim do mês.')
  })

  it('aperta quando sobra menos de 10% do que sai', () => {
    const b = monthBrief(base(250, [conta('a', 'Aluguel', 240, 20)]), TODAY)
    expect(b.verdict).toBe('tight')
    expect(b.endBalance).toBe(10)
  })

  it('não cobre: aponta o primeiro vencimento que deixa o saldo negativo', () => {
    const b = monthBrief(base(150, [conta('a', 'Luz', 100, 20), conta('b', 'Aluguel', 300, 25)]), TODAY)
    expect(b.verdict).toBe('no')
    expect(b.shortfall).toEqual({ date: '2026-10-25', title: 'Aluguel', missing: 250 })
    expect(briefHeadline(b, money)).toBe('O saldo não cobre tudo: faltam R$ 250,00 depois de "Aluguel".')
  })

  it('uma entrada antes do vencimento evita o aperto', () => {
    const b = monthBrief(base(50, [conta('s', 'Salário', 500, 18, 'entrada'), conta('a', 'Aluguel', 300, 20)]), TODAY)
    expect(b.verdict).toBe('ok')
    expect(b.inTotal).toBe(500)
    expect(b.endBalance).toBe(250)
  })

  it('conta atrasada entra na saída; conta já paga fica de fora', () => {
    const paga = { ...conta('p', 'Água', 80, 12), paid: { '2026-10': 'x' } }
    const b = monthBrief(base(1000, [conta('l', 'Gás', 60, 10), paga, conta('n', 'Seguro', 90, 5)]), TODAY)
    expect(b.lateOut).toBe(150)
    expect(b.outTotal).toBe(150)
    expect(b.count).toBe(2)
  })

  it('sem vencimentos restantes, diz que nada mais vence', () => {
    const b = monthBrief(base(500, []), TODAY)
    expect(b.count).toBe(0)
    expect(briefHeadline(b, money)).toBe('Nada mais vence neste mês.')
  })
})
