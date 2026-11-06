import { describe, expect, it } from 'vitest'
import type { Debt } from '@/lib/types'
import { funnyReceipt } from './comedy'

const divida = (p: Partial<Debt>): Debt => ({
  id: 'x', name: 'Leo', kind: 'receivable', principal: 100, rate: 0, interestType: 'simples',
  installments: 1, days: 30, date: '2026-11-05', dueDay: 5, firstDue: '2026-12-05', payments: [], discount: 0,
  lateFeePct: 0, lateInterestPct: 0, notes: '', ...p,
})
const ctx = {
  today: '2026-11-05',
  money: (v: number) => 'R$ ' + v.toFixed(2).replace('.', ','),
  date: (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7),
  rand: () => 0,
}

describe('funnyReceipt', () => {
  it('sem juros: mostra 0% e o total é o valor emprestado', () => {
    const t = funnyReceipt(divida({}), ctx)
    expect(t).toContain('Valor solicitado: *R$100,00*')
    expect(t).toContain('Juros: 0% (você é sortudo')
    expect(t).toContain('Plano: 1x sem juros')
    expect(t).toContain('VALOR A PAGAR: R$100,00* + um brownie')
    expect(t).not.toContain('IOFF')
  })

  it('com juros: reparte o juros real em três taxas que somam certo', () => {
    // 100 a 10% simples em 1 parcela = 110, juros 10 = 5 + 3 + 2
    const t = funnyReceipt(divida({ rate: 10 }), ctx)
    expect(t).toContain('IOFF (Imposto Sobre O Fazer Favores): 5% (R$5,00)')
    expect(t).toContain('Taxa de amizade em risco: 3% (R$3,00)')
    expect(t).toContain('Taxa de conveniência (eu tava com o dinheiro na mão): 2% (R$2,00)')
    expect(t).toContain('Parcela 01 (05/12): *R$110,00*')
    expect(t).toContain('VALOR A PAGAR: R$110,00*')
  })

  it('várias parcelas: cobra só a próxima, não o saldo todo', () => {
    const t = funnyReceipt(divida({ principal: 300, installments: 3, rate: 0, firstDue: '2026-12-05' }), ctx)
    expect(t).toContain('Plano: 3x sem juros')
    expect(t).toContain('Próxima parcela')
    expect(t).toContain('Parcela 01 (05/12): *R$100,00*')
    expect(t).not.toContain('Parcela 02')
    expect(t).not.toContain('Parcela 03')
    expect(t).toContain('VALOR A PAGAR: R$100,00*')
    expect(t).not.toContain('A PAGAR: R$300,00')
  })

  it('parcela já paga não aparece: cobra a seguinte', () => {
    const t = funnyReceipt(
      divida({ principal: 300, installments: 3, firstDue: '2026-12-05', payments: [{ date: '2026-11-06', amount: 100 }] }),
      ctx,
    )
    expect(t).not.toContain('Parcela 01')
    expect(t).toContain('Parcela 02 (05/01): *R$100,00*')
    expect(t).toContain('VALOR A PAGAR: R$100,00*')
  })

  it('com parcela atrasada: cobra só a atrasada, sem as futuras', () => {
    const t = funnyReceipt(divida({ principal: 300, installments: 3, firstDue: '2026-10-05' }), ctx)
    expect(t).toContain('Parcela em atraso')
    expect(t).toContain('Parcela 01 (05/10): *R$100,00*')
    expect(t).not.toContain('Parcela 02')
    expect(t).toContain('VALOR A PAGAR: R$100,00*')
  })

  it('inclui a chave Pix quando existe', () => {
    expect(funnyReceipt(divida({}), { ...ctx, pixKey: 'joao@pix.com' })).toContain('Chave Pix: joao@pix.com')
    expect(funnyReceipt(divida({}), ctx)).not.toContain('Chave Pix')
  })
})
