import { describe, expect, it } from 'vitest'
import type { Debt } from '@/lib/types'
import { makeDebtCalc } from './debts'
import {
  addMonthsISO, applyReneg, buildReneg, extendDefault, extendTargets, planSegments, remainingLabel, renegDefaults, rescheduleDebt, segLabel,
} from './renegotiation'

const money = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
const TODAY = '2026-03-05'
// 1000 em 4x de 250, vencimentos 10/04, 10/05, 10/06, 10/07 (nada vencido ainda)
const base = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Ana', kind: 'receivable', principal: 1000, rate: 0, interestType: 'composto', installments: 4, days: 120,
  date: '2026-03-10', dueDay: 10, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})

describe('planSegments / addMonthsISO', () => {
  it('junta parcelas seguidas de mesmo valor', () => {
    const seg = planSegments([{ v: 200, due: '2026-04-10' }, { v: 200, due: '2026-05-10' }, { v: 50, due: '2026-06-10' }])
    expect(seg).toEqual([{ n: 2, v: 200, from: '2026-04-10', to: '2026-05-10' }, { n: 1, v: 50, from: '2026-06-10', to: '2026-06-10' }])
    expect(seg.map((s) => segLabel(s, money))).toEqual(['2x de R$ 200,00', '1x de R$ 50,00'])
  })

  it('soma meses sem estourar o fim do mês', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-11-15', 3)).toBe('2027-02-15')
  })
})

describe('renegDefaults', () => {
  it('em dia: começa na primeira parcela em aberto', () => {
    expect(renegDefaults(base(), TODAY)).toEqual({ open: 1000, count: 4, curV: 250, start: '2026-04-10' })
  })

  it('atrasada: começa no próximo dia 10 a partir de hoje', () => {
    expect(renegDefaults(base({ date: '2026-01-10' }), '2026-03-15').start).toBe('2026-04-10')
  })
})

describe('buildReneg', () => {
  const start = '2026-04-10'

  it('modo depois: diferença volta em parcelas depois', () => {
    const r = buildReneg(base(), TODAY, { value: 200, start, mode: 'depois' })!
    expect(r.keep).toBe(0)
    expect(r.plan.map((p) => p.v)).toEqual([200, 200, 200, 200, 50, 50, 50, 50])
    expect(r.plan[0].due).toBe('2026-04-10')
    expect(r.plan[7].due).toBe('2026-11-10')
  })

  it('modo depois com valor da diferença escolhido', () => {
    const r = buildReneg(base(), TODAY, { value: 200, start, mode: 'depois', diffValue: 100 })!
    expect(r.plan.map((p) => p.v)).toEqual([200, 200, 200, 200, 100, 100])
  })

  it('modo fim: a diferença numa parcela só', () => {
    const r = buildReneg(base(), TODAY, { value: 200, start, mode: 'fim' })!
    expect(r.plan.map((p) => p.v)).toEqual([200, 200, 200, 200, 200])
  })

  it('modo estender: mais parcelas do valor novo, a última com o resto', () => {
    const r = buildReneg(base(), TODAY, { value: 300, start, mode: 'estender' })!
    expect(r.plan.map((p) => p.v)).toEqual([300, 300, 300, 100])
  })

  it('valor maior que a parcela encurta o plano', () => {
    const r = buildReneg(base(), TODAY, { value: 500, start, mode: 'depois' })!
    expect(r.plan.map((p) => p.v)).toEqual([500, 500])
  })

  it('o que já foi pago de uma parcela fica como está', () => {
    const d = base({ payments: [{ date: '2026-03-06', amount: 100, mode: 'fifo' }] })
    const r = buildReneg(d, TODAY, { value: 225, start, mode: 'estender' })!
    expect(r.keep).toBe(1)
    expect(r.open).toBe(900)
    expect(r.plan.map((p) => p.v)).toEqual([100, 225, 225, 225, 225])
  })

  it('sobra de centavos entra na última parcela, sem parcela nova', () => {
    const d = base({ principal: 100, installments: 3 }) // 33,33 x3
    const r = buildReneg(d, TODAY, { value: 33.33, start, mode: 'depois' })!
    expect(r.plan.map((p) => p.v)).toEqual([33.33, 33.33, 33.34])
  })

  it('recusa valor zero, data ruim, dívida quitada e plano gigante', () => {
    expect(buildReneg(base(), TODAY, { value: 0, start, mode: 'fim' })).toBeNull()
    expect(buildReneg(base(), TODAY, { value: 100, start: '', mode: 'fim' })).toBeNull()
    expect(buildReneg(base({ payments: [{ date: TODAY, amount: 1000, mode: 'fifo' }] }), TODAY, { value: 100, start, mode: 'fim' })).toBeNull()
    expect(buildReneg(base({ principal: 100000 }), TODAY, { value: 10, start, mode: 'estender' })).toBeNull()
  })
})

describe('applyReneg', () => {
  const start = '2026-04-10'

  it('troca o plano e mantém o que falta igual', () => {
    const d = base({ payments: [{ date: '2026-03-06', amount: 100, mode: 'fifo' }] })
    const r = buildReneg(d, TODAY, { value: 225, start, mode: 'estender' })!
    const out = applyReneg(d, r, TODAY, money, ' combinamos ')
    const calc = makeDebtCalc(TODAY)
    expect(calc.remaining(out)).toBe(900)
    expect(out.installments).toBe(5)
    expect(out.days).toBe(150)
    expect(out.plan).toHaveLength(5)
    expect(out.reneg).toEqual([{ at: TODAY, from: '1x de R$ 150,00 + 3x de R$ 250,00', to: '4x de R$ 225,00', note: 'combinamos' }])
    // a dívida original não muda
    expect(d.plan).toBeUndefined()
  })

  it('encargos que ficaram para trás entram na última parcela', () => {
    // 2 parcelas de 100 vencidas há muito tempo, multa 10%: em aberto passa de 200
    const d = base({ principal: 200, installments: 2, date: '2025-10-10', lateFeePct: 10 })
    const open = makeDebtCalc('2026-03-15').remaining(d)
    expect(open).toBeGreaterThan(200)
    const r = buildReneg(d, '2026-03-15', { value: 100, start: '2026-04-10', mode: 'estender' })!
    const out = applyReneg(d, r, '2026-03-15', money)
    expect(makeDebtCalc('2026-03-15').remaining(out)).toBeCloseTo(open, 2)
  })

  it('limpa remarcações das parcelas trocadas e guarda as das mantidas', () => {
    const d = base({ dueOverride: { '0': '2026-04-20', '2': '2026-06-20' }, payments: [{ date: '2026-03-06', amount: 250, mode: 'fifo' }] })
    const r = buildReneg(d, TODAY, { value: 250, start: '2026-05-10', mode: 'estender' })!
    expect(r.keep).toBe(1)
    const out = applyReneg(d, r, TODAY, money)
    expect(out.dueOverride).toEqual({ '0': '2026-04-20' })
  })

  it('remainingLabel descreve o que falta', () => {
    expect(remainingLabel(base(), TODAY, money)).toBe('4x de R$ 250,00')
  })
})

describe('mais prazo', () => {
  it('sem atraso mexe só na próxima parcela', () => {
    expect(extendTargets(base(), TODAY)).toEqual([{ idx: 0, dueISO: '2026-04-10' }])
    expect(extendDefault(base(), TODAY)).toBe('2026-04-17')
  })

  it('com atraso mexe em todas as atrasadas', () => {
    const d = base({ date: '2026-01-10' }) // 10/02 e 10/03 vencidas em 15/03
    expect(extendTargets(d, '2026-03-15').map((t) => t.idx)).toEqual([0, 1])
    const { debt, moved } = rescheduleDebt(d, '2026-03-15', '2026-03-25')
    expect(moved).toBe(2)
    expect(debt.dueOverride).toEqual({ '0': '2026-03-25', '1': '2026-03-25' })
    expect(makeDebtCalc('2026-03-15').schedule(debt).overdue).toBe(0)
  })

  it('data que não é depois do vencimento não muda nada', () => {
    const d = base()
    const { debt, moved } = rescheduleDebt(d, TODAY, '2026-04-10')
    expect(moved).toBe(0)
    expect(debt).toBe(d)
  })
})
