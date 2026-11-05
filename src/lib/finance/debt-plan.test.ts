import { describe, expect, it } from 'vitest'
import type { AppData, Debt } from '@/lib/types'
import { emptyData } from '@/lib/storage'
import { debtPlan } from './debt-plan'

const TODAY = '2026-10-15'
const divida = (p: Partial<Debt>): Debt => ({
  id: 'x', name: 'Dívida', kind: 'payable', principal: 1000, rate: 0, interestType: 'composto',
  installments: 1, days: 30, date: '2026-10-01', dueDay: 25, firstDue: '2026-10-25', payments: [], discount: 0,
  lateFeePct: 0, lateInterestPct: 0, notes: '', ...p,
})
const dados = (debts: Debt[]): AppData => ({ ...emptyData(), debts })

describe('debtPlan', () => {
  it('só considera o que eu devo e ainda não está pago', () => {
    const paga = divida({ id: 'p', name: 'Paga', payments: [{ date: '2026-10-02', amount: 1000 }] })
    const plano = debtPlan(dados([divida({ id: 'a', name: 'Cartão' }), divida({ id: 'r', name: 'Emprestei', kind: 'receivable' }), paga]), TODAY)
    expect(plano.debts.map((d) => d.name)).toEqual(['Cartão'])
    expect(plano.totalRemaining).toBe(1000)
  })

  it('juros primeiro: maior taxa mensal na frente, mesmo com saldo maior', () => {
    const plano = debtPlan(
      dados([
        divida({ id: 'a', name: 'Amigo', principal: 200, rate: 0 }),
        divida({ id: 'b', name: 'Rotativo', principal: 900, rate: 12, installments: 1 }),
        divida({ id: 'c', name: 'Financ.', principal: 500, rate: 3, installments: 1 }),
      ]),
      TODAY,
      'juros',
    )
    expect(plano.debts.map((d) => d.name)).toEqual(['Rotativo', 'Financ.', 'Amigo'])
    expect(plano.debts[0].reason).toBe('juros')
    expect(plano.debts[2].reason).toBe('menor')
  })

  it('menor saldo primeiro ignora a taxa', () => {
    const plano = debtPlan(
      dados([
        divida({ id: 'a', name: 'Grande', principal: 900, rate: 12 }),
        divida({ id: 'b', name: 'Pequena', principal: 100, rate: 0 }),
      ]),
      TODAY,
      'menor',
    )
    expect(plano.debts.map((d) => d.name)).toEqual(['Pequena', 'Grande'])
  })

  it('atrasada sempre vem antes, em qualquer estratégia', () => {
    const lista = [
      divida({ id: 'a', name: 'Em dia', principal: 100, rate: 20 }),
      divida({ id: 'b', name: 'Atrasada', principal: 800, firstDue: '2026-09-20', lateInterestPct: 1 }),
    ]
    for (const s of ['juros', 'menor'] as const) {
      const plano = debtPlan(dados(lista), TODAY, s)
      expect(plano.debts[0]).toMatchObject({ name: 'Atrasada', reason: 'atrasada' })
      expect(plano.totalOverdue).toBeGreaterThan(0)
    }
  })

  it('com valor mensal: paga a parcela de cada uma e a sobra vai para a primeira da fila', () => {
    const plano = debtPlan(
      dados([
        divida({ id: 'a', name: 'A', principal: 300, installments: 3 }),
        divida({ id: 'b', name: 'B', principal: 700, installments: 7 }),
      ]),
      TODAY,
      'menor',
      400,
    )
    expect(plano.debts.map((d) => d.installment)).toEqual([100, 100])
    expect(plano.minMonthly).toBe(200)
    expect(plano.debts.map((d) => [d.name, d.paidInMonth])).toEqual([['A', 1], ['B', 3]])
    expect(plano.months).toBe(3)
    expect(plano.belowMin).toBe(false)
  })

  it('valor mensal abaixo da soma das parcelas não gera prazo', () => {
    const plano = debtPlan(
      dados([
        divida({ id: 'a', name: 'A', principal: 300, installments: 3 }),
        divida({ id: 'b', name: 'B', principal: 700, installments: 7 }),
      ]),
      TODAY,
      'menor',
      150,
    )
    expect(plano.belowMin).toBe(true)
    expect(plano.months).toBeNull()
    expect(plano.debts.every((d) => d.paidInMonth === null)).toBe(true)
  })

  it('sem valor mensal, não inventa prazo', () => {
    const plano = debtPlan(dados([divida({})]), TODAY)
    expect(plano.months).toBeNull()
    expect(plano.debts[0].paidInMonth).toBeNull()
  })

  it('dívida com plano de parcelas fixas ignora a taxa para ordenar', () => {
    const plano = debtPlan(
      dados([
        divida({ id: 'a', name: 'Fixas', rate: 50, plan: [{ v: 100, due: '2026-10-25' }] }),
        divida({ id: 'b', name: 'Com taxa', principal: 100, rate: 2 }),
      ]),
      TODAY,
      'juros',
    )
    expect(plano.debts[0].name).toBe('Com taxa')
    expect(plano.debts[1].monthlyRate).toBe(0)
  })
})
