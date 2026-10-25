import { describe, expect, it } from 'vitest'
import type { Debt, Group } from '@/lib/types'
import { makeDebtCalc } from './debts'
import {
  addParticipants, checkGroupInput, createGroup, deleteGroup, emptyGroupInput, groupChargeText, groupData, groupMatches, groupStats,
  groupSumNote, groupToInput, recalcEqual, splitEqual, updateGroup, whatsPhone, withEqualSplit, type GroupInput, type GroupPart,
} from './groups'

const TODAY = '2026-03-15'
const calc = makeDebtCalc(TODAY)
const money = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
const sum = (xs: number[]) => Math.round(xs.reduce((s, v) => s + v, 0) * 100) / 100

const part = (name: string, over: Partial<GroupPart> = {}): GroupPart => ({ name, amount: 0, debtId: null, locked: false, paid: 0, ...over })
const input = (over: Partial<GroupInput> = {}): GroupInput => ({
  ...emptyGroupInput('receivable', TODAY), title: 'Churrasco', total: 100, date: '2026-03-10', dueDate: '2026-03-20',
  parts: [part('Ana'), part('Bia'), part('Caio')], includeMe: false, ...over,
})

describe('splitEqual', () => {
  it('R$ 100 / 3 = 33,34 + 33,33 + 33,33', () => expect(splitEqual(100, 3)).toEqual([33.34, 33.33, 33.33]))

  it('a soma sempre bate com o total, sem perder centavo', () => {
    for (const [total, n] of [[100, 3], [0.01, 3], [1234.56, 7], [10, 6], [99.99, 2], [0.1, 3], [5000, 60]] as const) {
      const parts = splitEqual(total, n)
      expect(parts).toHaveLength(n)
      expect(sum(parts)).toBe(total)
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(0.01 + 1e-9)
    }
  })

  it('zero pessoas não quebra', () => expect(splitEqual(10, 0)).toEqual([]))
})

describe('groupData', () => {
  it('aplica os padrões do antigo', () => {
    const g = groupData({ id: 'g1', title: 'X', kind: 'payable', total: 10, includeMe: true, myShare: 5 } as Group)
    expect(g).toMatchObject({ kind: 'payable', includeMe: false, myShare: 0, splitMode: 'equal', walletId: '', notes: '' })
  })
})

describe('divisão igual', () => {
  it('sem mim: divide entre os participantes', () => {
    const r = recalcEqual(input())
    expect(r.parts.map((p) => p.amount)).toEqual([33.34, 33.33, 33.33])
    expect(r.me).toBe(0)
  })

  it('comigo: eu entro na divisão e fico com o último pedaço', () => {
    const r = recalcEqual(input({ includeMe: true }))
    expect(r.parts.map((p) => p.amount)).toEqual([25, 25, 25])
    expect(r.me).toBe(25)
    expect(sum([...r.parts.map((p) => p.amount), r.me])).toBe(100)
  })

  it('quem já pagou mantém o valor e o resto se redivide', () => {
    const i = input({ parts: [part('Ana', { locked: true, amount: 40, paid: 40, debtId: 'a' }), part('Bia'), part('Caio')] })
    const r = recalcEqual(i)
    expect(r.parts.map((p) => p.amount)).toEqual([40, 30, 30])
    expect(r.eq).toMatchObject({ rest: 60, n: 2, fixed: 40, locked: 1 })
  })

  it('quem já pagou soma mais que o total: ninguém recebe valor e a validação reclama', () => {
    const i = input({ total: 30, parts: [part('Ana', { locked: true, amount: 40, paid: 40, debtId: 'a' }), part('Bia')] })
    expect(withEqualSplit(i).parts[1].amount).toBe(0)
    expect(checkGroupInput(i)).toMatch(/mais que o total/)
  })
})

describe('checkGroupInput', () => {
  it('valida os campos', () => {
    expect(checkGroupInput(input({ title: ' ' }))).toMatch(/nome ao grupo/)
    expect(checkGroupInput(input({ total: 0 }))).toMatch(/valor total/)
    expect(checkGroupInput(input({ dueDate: '' }))).toMatch(/até quando/)
    expect(checkGroupInput(input({ dueDate: '2026-03-01' }))).toMatch(/antes da data/)
    expect(checkGroupInput(input({ parts: [] }))).toMatch(/pelo menos uma pessoa/)
    expect(checkGroupInput(input())).toBeNull()
  })

  it('divisão por valor: exige cada valor e fechar o total', () => {
    const custom = (amounts: number[], me = 0, includeMe = false) =>
      input({ split: 'custom', includeMe, me, parts: amounts.map((a, i) => part('P' + i, { amount: a })) })
    expect(checkGroupInput(custom([50, 0]))).toMatch(/valor de cada pessoa/)
    expect(checkGroupInput(custom([50, 40]))).toMatch(/Faltam/)
    expect(checkGroupInput(custom([60, 50]))).toMatch(/passou/)
    expect(checkGroupInput(custom([50, 30], 20, true))).toBeNull()
  })

  it('a nota de conferência descreve a divisão', () => {
    expect(groupSumNote(input(), money)).toMatchObject({ tone: 'ok' })
    expect(groupSumNote(input(), money).text).toContain('R$ 100,00 ÷ 3')
    expect(groupSumNote(input({ total: 0 }), money).tone).toBe('info')
    expect(groupSumNote(input({ split: 'custom', parts: [part('A', { amount: 10 })] }), money).tone).toBe('warn')
  })
})

describe('participantes', () => {
  it('separa por vírgula, ignora repetido e devolve quem repetiu', () => {
    const r = addParticipants([part('Ana')], [], 'ana, Bia; Caio\nBia')
    expect(r.parts.map((p) => p.name)).toEqual(['Ana', 'Bia', 'Caio'])
    expect(r.dupes).toEqual(['ana', 'Bia'])
  })

  it('quem saiu e volta recupera o vínculo', () => {
    const gone = part('Bia', { debtId: 'd9', locked: true, paid: 10 })
    const r = addParticipants([], [gone], 'bia')
    expect(r.parts[0]).toBe(gone)
    expect(r.removed).toEqual([])
  })

  it('limite de 60 pessoas', () => {
    const many = Array.from({ length: 60 }, (_, i) => part('P' + i))
    expect(addParticipants(many, [], 'Extra').parts).toHaveLength(60)
  })
})

describe('criar e editar grupo', () => {
  const made = createGroup(input({ includeMe: true }), [], 'g-1')

  it('cria uma dívida por pessoa com prazo, data e vínculo', () => {
    expect(made.group).toMatchObject({ id: 'g-1', title: 'Churrasco', total: 100, includeMe: true, myShare: 25, splitMode: 'equal' })
    expect(made.debts).toHaveLength(3)
    expect(made.debts[0]).toMatchObject({
      name: 'Ana', principal: 25, groupId: 'g-1', firstDue: '2026-03-20', dueDay: 20, date: '2026-03-10', installments: 1, kind: 'receivable',
    })
    expect(sum(made.debts.map((d) => d.principal)) + made.group.myShare).toBe(100)
  })

  it('estatísticas do grupo', () => {
    const debts = made.debts.map((d, i) => (i === 0 ? { ...d, payments: [{ date: TODAY, amount: 25, mode: 'fifo' as const }] } : d))
    const st = groupStats(debts, 'g-1', calc)
    expect(st).toMatchObject({ owed: 75, paid: 25, remaining: 50, done: 1, late: 0 })
    expect(groupMatches(groupData(made.group), st, 'abertos', '')).toBe(true)
    expect(groupMatches(groupData(made.group), st, 'quitados', '')).toBe(false)
    expect(groupMatches(groupData(made.group), st, 'todos', 'bia')).toBe(true)
    expect(groupMatches(groupData(made.group), st, 'todos', 'zzz')).toBe(false)
  })

  it('edição: sai quem não pagou (apaga), sai quem pagou (vira individual), entra gente nova', () => {
    const debts: Debt[] = made.debts.map((d, i) => (i === 0 ? { ...d, payments: [{ date: TODAY, amount: 25, mode: 'fifo' as const }] } : d))
    const g = groupData(made.group)
    const edit = groupToInput(g, debts)
    expect(edit.parts[0]).toMatchObject({ locked: true, paid: 25 })
    // tira Ana (pagou) e Bia (não pagou), põe Dani, aumenta o total
    const next: GroupInput = { ...edit, total: 150, parts: [edit.parts[2], part('Dani')] }
    const r = updateGroup(g, next, debts, calc)
    expect(r.detached).toBe(1)
    expect(r.removed).toBe(1)
    expect(r.created).toBe(1)
    expect(r.debts.find((d) => d.name === 'Ana')?.groupId).toBeUndefined()
    expect(r.debts.some((d) => d.name === 'Bia')).toBe(false)
    const members = r.debts.filter((d) => d.groupId === 'g-1')
    expect(members.map((d) => d.name).sort()).toEqual(['Caio', 'Dani'])
    // 150 dividido entre Caio, Dani e eu = 50 cada
    expect(members.map((d) => d.principal)).toEqual([50, 50])
    expect(r.group.total).toBe(150)
    expect(r.group.myShare).toBe(50)
  })

  it('editar o prazo só muda as dívidas ainda abertas', () => {
    const debts: Debt[] = made.debts.map((d, i) => (i === 0 ? { ...d, payments: [{ date: TODAY, amount: 25, mode: 'fifo' as const }] } : d))
    const g = groupData(made.group)
    const r = updateGroup(g, { ...groupToInput(g, debts), dueDate: '2026-04-05' }, debts, calc)
    expect(r.debts.find((d) => d.name === 'Ana')?.firstDue).toBe('2026-03-20')
    expect(r.debts.find((d) => d.name === 'Bia')).toMatchObject({ firstDue: '2026-04-05', dueDay: 5 })
  })

  it('excluir: mantém as dívidas como individuais ou apaga', () => {
    const kept = deleteGroup(made.debts, 'g-1', true)
    expect(kept).toHaveLength(3)
    expect(kept.every((d) => d.groupId === undefined)).toBe(true)
    expect(deleteGroup(made.debts, 'g-1', false)).toHaveLength(0)
    expect(deleteGroup(made.debts, 'outro', false)).toHaveLength(3)
  })
})

describe('cobrar pendentes', () => {
  it('lista quem falta, quem pagou, prazo, pix e link', () => {
    const made = createGroup(input(), [], 'g-1')
    const debts = made.debts.map((d, i) => (i === 0 ? { ...d, payments: [{ date: TODAY, amount: d.principal, mode: 'fifo' as const }] } : d))
    const g = groupData(made.group)
    const st = groupStats(debts, 'g-1', calc)
    const r = groupChargeText(g, st, calc, { money, date: (iso) => iso, pixKey: 'a@b.com', link: 'https://x/s/abc' })
    expect(r.pend.map((d) => d.name)).toEqual(['Bia', 'Caio'])
    expect(r.text).toContain('• Bia: R$33,33')
    expect(r.text).toContain('Já pagaram: Ana ✓')
    expect(r.text).toContain('Prazo: 2026-03-20')
    expect(r.text).toContain('*Pix:* a@b.com')
    expect(r.text).toContain('*Quem já pagou:* https://x/s/abc')
  })

  it('telefone: assume Brasil sem DDI', () => {
    expect(whatsPhone('(11) 99999-8888')).toBe('5511999998888')
    expect(whatsPhone('5511999998888')).toBe('5511999998888')
    expect(whatsPhone('')).toBe('')
  })
})
