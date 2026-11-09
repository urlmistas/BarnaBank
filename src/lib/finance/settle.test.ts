import { describe, expect, it } from 'vitest'
import { settleUp } from './settle'

const sumTransfers = (t: { amount: number }[]) => Math.round(t.reduce((s, x) => s + x.amount, 0) * 100) / 100

describe('racha de contas', () => {
  it('um paga tudo e divide por todos: os outros pagam a ele', () => {
    const r = settleUp(['Ana', 'Bia', 'Caio'], [{ desc: 'Jantar', amount: 90, payer: 'Ana', among: [] }])
    expect(r.balance).toEqual({ Ana: 60, Bia: -30, Caio: -30 })
    expect(r.transfers).toEqual([
      { from: 'Bia', to: 'Ana', amount: 30 },
      { from: 'Caio', to: 'Ana', amount: 30 },
    ])
  })

  it('reduz as transferências: a corrente A→B→C vira A paga C direto', () => {
    const r = settleUp(['Ana', 'Bia', 'Caio'], [
      { desc: 'x', amount: 30, payer: 'Bia', among: ['Ana'] },
      { desc: 'y', amount: 30, payer: 'Caio', among: ['Bia'] },
    ])
    expect(r.transfers).toEqual([{ from: 'Ana', to: 'Caio', amount: 30 }])
  })

  it('no máximo (pessoas − 1) transferências e o que sai bate com o que entra', () => {
    const people = ['A', 'B', 'C', 'D', 'E']
    const r = settleUp(people, [
      { desc: '1', amount: 100, payer: 'A', among: [] },
      { desc: '2', amount: 57.5, payer: 'B', among: ['A', 'B', 'C'] },
      { desc: '3', amount: 23.9, payer: 'D', among: ['C', 'D', 'E'] },
      { desc: '4', amount: 80, payer: 'E', among: [] },
    ])
    expect(r.transfers.length).toBeLessThanOrEqual(people.length - 1)
    const bal = Object.values(r.balance)
    expect(bal.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 2)
    const owed = bal.filter((v) => v > 0).reduce((s, v) => s + v, 0)
    expect(sumTransfers(r.transfers)).toBeCloseTo(owed, 2)
    expect(r.total).toBe(261.4)
  })

  it('centavo não se perde: R$ 100 em 3 dá 33,34 + 33,33 + 33,33', () => {
    const r = settleUp(['A', 'B', 'C'], [{ desc: 'x', amount: 100, payer: 'A', among: [] }])
    expect(r.share).toEqual({ A: 33.34, B: 33.33, C: 33.33 })
    expect(r.balance.A + r.balance.B + r.balance.C).toBeCloseTo(0, 2)
  })

  it('despesa inválida (valor zero, pagador desconhecido, ninguém para dividir) é ignorada', () => {
    const r = settleUp(['A', 'B'], [
      { desc: 'x', amount: 0, payer: 'A', among: [] },
      { desc: 'y', amount: 10, payer: 'Z', among: [] },
      { desc: 'z', amount: 10, payer: 'A', among: ['Z'] },
    ])
    expect(r.total).toBe(0)
    expect(r.transfers).toEqual([])
  })

  it('todos quites: nenhuma transferência', () => {
    const r = settleUp(['A', 'B'], [
      { desc: 'x', amount: 10, payer: 'A', among: [] },
      { desc: 'y', amount: 10, payer: 'B', among: [] },
    ])
    expect(r.transfers).toEqual([])
  })
})
