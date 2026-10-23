import { describe, expect, it } from 'vitest'
import type { Debt } from '@/lib/types'
import { makeDebtCalc } from './debts'
import {
  checkDebtInput, checkPartial, createDebt, debtToInput, emptyDebtInput, partialPayment, quickPayInfo, quickPayment, removePayment,
  settleDebt, updateDebt,
} from './mutations'

const TODAY = '2026-03-15'
const base = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Ana', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto', installments: 3, days: 90,
  date: '2026-01-10', dueDay: 10, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})

describe('pagamento rápido', () => {
  it('com atraso paga tudo que venceu (fifo)', () => {
    // parcelas de 10/02 e 10/03 vencidas (200), a de 10/04 ainda não
    expect(quickPayInfo(base(), TODAY)).toEqual({ amount: 200, mode: 'fifo' })
  })

  it('sem atraso paga a próxima parcela (target)', () => {
    const d = base({ payments: [{ date: '2026-03-01', amount: 200, mode: 'fifo' }] })
    expect(quickPayInfo(d, TODAY)).toEqual({ amount: 100, mode: 'target', target: 2 })
  })

  it('dívida quitada não tem pagamento rápido', () => {
    expect(quickPayInfo(base({ payments: [{ date: TODAY, amount: 300, mode: 'fifo' }] }), TODAY)).toBeNull()
  })

  it('quickPayment grava carteira e id', () => {
    const p = quickPayment(base(), TODAY, 'w1')!
    expect(p).toMatchObject({ date: TODAY, amount: 200, mode: 'fifo', walletId: 'w1' })
    expect(p.id).toBeTruthy()
  })
})

describe('pagamento parcial', () => {
  it('valida valor, limite e data', () => {
    const d = base()
    expect(checkPartial(d, TODAY, { amount: 0, date: TODAY })).toBe('Informe o valor.')
    expect(checkPartial(d, TODAY, { amount: 301, date: TODAY })).toMatch(/mais do que/)
    expect(checkPartial(d, TODAY, { amount: 50, date: '' })).toMatch(/data/)
    expect(checkPartial(d, TODAY, { amount: 50, date: TODAY })).toBeNull()
  })

  it('reduz o que falta', () => {
    const d = base()
    d.payments.push(partialPayment({ amount: 50, date: TODAY, note: ' meio ' }))
    expect(d.payments[0]).toMatchObject({ amount: 50, mode: 'fifo', note: 'meio' })
    expect(makeDebtCalc(TODAY).remaining(d)).toBe(250)
  })
})

describe('remover pagamento', () => {
  it('pagamentos adiantados voltam a cobrir a parcela mais antiga', () => {
    const d = base({
      payments: [
        { id: 'a', date: '2026-02-10', amount: 100, mode: 'fifo' },
        { id: 'b', date: '2026-03-01', amount: 100, mode: 'target', target: 2 },
      ],
    })
    const out = removePayment(d, 0)
    expect(out.payments).toHaveLength(1)
    expect(out.payments[0].mode).toBe('fifo')
    expect(out.payments[0].target).toBeUndefined()
  })

  it('id inexistente não muda nada', () => {
    const d = base()
    expect(removePayment(d, 9)).toBe(d)
  })
})

describe('quitação com desconto', () => {
  it('paga o combinado e perdoa o resto', () => {
    const out = settleDebt(base(), TODAY, { value: 250, date: TODAY })
    expect(out.discount).toBe(50)
    expect(out.settledDate).toBe(TODAY)
    expect(makeDebtCalc(TODAY).isPaid(out)).toBe(true)
  })
})

describe('formulário de dívida', () => {
  const ok = { ...emptyDebtInput('receivable', TODAY), name: ' Bia ', principal: 120, installments: 4 }

  it('valida', () => {
    expect(checkDebtInput({ ...ok, name: ' ' })).toMatch(/nome do amigo/)
    expect(checkDebtInput({ ...ok, kind: 'payable', name: '' })).toMatch(/empresa/)
    expect(checkDebtInput({ ...ok, principal: 0 })).toMatch(/valor/)
    expect(checkDebtInput({ ...ok, installments: 0 })).toMatch(/parcelas/)
    expect(checkDebtInput({ ...ok, lateFeePct: 101 })).toMatch(/Multa/)
    expect(checkDebtInput({ ...ok, phone: '1199' })).toMatch(/Telefone/)
    expect(checkDebtInput(ok)).toBeNull()
  })

  it('cria uma dívida a receber', () => {
    const d = createDebt(ok, 'x1')
    expect(d).toMatchObject({ id: 'x1', name: 'Bia', principal: 120, installments: 4, days: 120, kind: 'receivable', payments: [], discount: 0 })
    expect(d.recurring).toBeUndefined()
  })

  it('a pagar ignora juros e a recorrente fica com 1 parcela', () => {
    const d = createDebt({ ...ok, kind: 'payable', rate: 5, interestType: 'price', recurring: true, recLabel: 'Netflix', installments: 9 }, 'x2')
    expect(d).toMatchObject({ rate: 0, interestType: 'composto', installments: 1, days: 30 })
    expect(d.recurring).toEqual({ amount: 120, label: 'Netflix' })
  })

  it('editar mexendo no valor desfaz a renegociação; sem mexer, mantém', () => {
    const d = base({ plan: [{ v: 150, due: '2026-04-10' }, { v: 150, due: '2026-05-10' }], installments: 2 })
    const same = updateDebt(d, { ...debtToInput(d), notes: 'oi' })
    expect(same.plan).toBeDefined()
    expect(same.notes).toBe('oi')
    const changed = updateDebt(d, { ...debtToInput(d), principal: 400 })
    expect(changed.plan).toBeUndefined()
    expect(changed.principal).toBe(400)
  })

  it('editar mantém os pagamentos e remove assunto vazio', () => {
    const d = base({ subject: 'moto', payments: [{ id: 'p', date: TODAY, amount: 10, mode: 'fifo' }] })
    const out = updateDebt(d, { ...debtToInput(d), subject: '' })
    expect(out.subject).toBeUndefined()
    expect(out.payments).toHaveLength(1)
  })

  it('trocar o dia de vencimento move o firstDue', () => {
    const d = base({ firstDue: '2026-02-10' })
    expect(updateDebt(d, { ...debtToInput(d), dueDay: 31 }).firstDue).toBe('2026-02-28')
  })
})
