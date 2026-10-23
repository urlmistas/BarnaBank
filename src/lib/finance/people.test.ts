import { describe, expect, it } from 'vitest'
import type { AppData, Debt } from '@/lib/types'
import { emptyData } from '@/lib/storage'
import { buildDemoData } from '@/lib/demo-data'
import { dashboardSummary } from './dashboard'
import {
  buildPersonRows, debtLabel, filterCounts, filterPeople, initials, matchesQuery, nameKey, normTxt,
  paymentSeries, peopleTotals, personDetail, personMonthEvents, personMonthRange, personStatus,
} from './people'

const base = (p: Partial<Debt>): Debt => ({
  id: 'x', name: 'Fulano', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto',
  installments: 3, days: 90, date: '2026-01-10', dueDay: 10, payments: [], discount: 0,
  lateFeePct: 0, lateInterestPct: 0, notes: '', ...p,
})
const data = (p: Partial<AppData>): AppData => ({ ...emptyData(), ...p })
const fmt = (iso: string) => iso.split('-').reverse().join('/')
const today = '2026-03-15' // parcelas de 300/3: 10/02 e 10/03 vencidas, 10/04 a vencer

const dt = data({
  groups: [{ id: 'g', title: 'Churrasco', kind: 'receivable', total: 100 }],
  wallets: [{ id: 'w', name: 'Nubank' }],
  debts: [
    base({ id: 'a1', name: 'Ana Souza', payments: [{ date: '2026-02-10', amount: 100, walletId: 'w' }] }),
    base({ id: 'a2', name: ' ana souza ', installments: 1, principal: 50, firstDue: '2026-03-20', groupId: 'g' }),
    base({ id: 'b1', name: 'Bruno', installments: 1, principal: 80, firstDue: '2026-04-01' }),
    base({ id: 'c1', name: 'Carla', kind: 'payable', installments: 1, principal: 200, firstDue: '2026-03-30' }),
    base({ id: 'd1', name: 'Diego', installments: 1, principal: 40, firstDue: '2026-02-01', payments: [{ date: '2026-02-03', amount: 40 }] }),
    base({ id: 'e1', name: 'Érica Lima', subject: 'Conserto do carro', installments: 1, principal: 90, firstDue: '2026-03-01', payments: [{ date: '2026-03-01', amount: 90 }] }),
    base({ id: 'e2', name: 'Érica Lima', installments: 2, principal: 60, firstDue: '2026-03-10', kind: 'payable' }),
  ],
})

describe('pessoas: helpers', () => {
  it('nameKey e initials como o antigo', () => {
    expect(nameKey('  Ana Souza ')).toBe('ana souza')
    expect(initials('ana maria souza')).toBe('AS')
    expect(initials('Pedro')).toBe('P')
    expect(initials('   ')).toBe('?')
    expect(initials('Carlos (oficina)')).toBe('C')
    expect(initials('Érica lima')).toBe('ÉL')
  })
  it('normTxt remove acentos', () => {
    expect(normTxt('Érica JÚLIA')).toBe('erica julia')
  })
  it('debtLabel: assunto > grupo > recorrente > tipo + data + parcelas', () => {
    expect(debtLabel(base({ subject: 'Aluguel' }), 'G', fmt)).toBe('Aluguel')
    expect(debtLabel(base({}), 'G', fmt)).toBe('G')
    expect(debtLabel(base({ kind: 'payable', recurring: { amount: 1, label: '' } }), undefined, fmt)).toBe('Cobrança mensal')
    expect(debtLabel(base({}), undefined, fmt)).toBe('Empréstimo de 10/01/2026 · 3x')
    expect(debtLabel(base({ kind: 'payable', installments: 1 }), undefined, fmt)).toBe('Dívida de 10/01/2026')
  })
})

describe('pessoas: lista', () => {
  const rows = buildPersonRows(dt, today)
  const by = (name: string) => rows.find((r) => r.key === nameKey(name))!

  it('agrupa pelo nome normalizado, inclusive dívidas de grupo', () => {
    const ana = by('Ana Souza')
    expect(ana.debts.map((d) => d.id)).toEqual(['a1', 'a2'])
    expect(ana.name).toBe('Ana Souza')
    expect(ana.toReceive).toBe(250) // 200 do parcelado + 50 do grupo
    expect(ana.lateInstallments).toBe(1) // 10/03 vencida; 10/02 foi paga
    expect(ana.lateAmount).toBe(100)
    expect(ana.oldestLateISO).toBe('2026-03-10')
  })
  it('líquido: a receber positivo, eu devo negativo', () => {
    expect(by('Carla').net).toBe(-200)
    expect(by('Érica Lima').net).toBe(-60)
    expect(by('Érica Lima').settledNet).toBe(90)
  })
  it('status: atraso em dias, em dia com próximo vencimento, quitado', () => {
    expect(personStatus(by('Ana Souza'), today)).toEqual({ kind: 'late', installments: 1, days: 5 })
    expect(personStatus(by('Bruno'), today)).toEqual({ kind: 'open', openCount: 1, nextDueISO: '2026-04-01', dueInDays: 17 })
    expect(personStatus(by('Diego'), today)).toEqual({ kind: 'settled' })
  })
  it('filtros com a semântica das pílulas do antigo', () => {
    const names = (f: Parameters<typeof filterPeople>[1], q = '') => filterPeople(rows, f, q).map((r) => r.name)
    // atrasados primeiro, depois por próximo vencimento
    expect(names('abertos')).toEqual(['Ana Souza', 'Érica Lima', 'Carla', 'Bruno'])
    expect(names('atrasados')).toEqual(['Ana Souza', 'Érica Lima'])
    // quitados: quem tem alguma dívida quitada, mesmo com outra em aberto
    expect(names('quitados')).toEqual(['Érica Lima', 'Diego'])
    expect(names('todos')).toHaveLength(5)
    expect(filterCounts(rows, '')).toEqual({ abertos: 4, atrasados: 2, quitados: 2, todos: 5 })
  })
  it('busca por nome ou assunto, sem acento', () => {
    expect(matchesQuery(by('Érica Lima'), 'erica')).toBe(true)
    expect(matchesQuery(by('Érica Lima'), 'CARRO')).toBe(true)
    expect(matchesQuery(by('Bruno'), 'carro')).toBe(false)
    expect(filterCounts(rows, 'souza')).toEqual({ abertos: 1, atrasados: 1, quitados: 0, todos: 1 })
  })
  it('totais: mesmos números do Início + já recebido', () => {
    const t = peopleTotals(dt, today)
    const s = dashboardSummary(dt, today)
    expect(t.toReceive).toBe(s.toReceive)
    expect(t.late).toBe(s.toReceiveLate)
    expect(t.toReceive).toBe(330) // 250 Ana + 80 Bruno
    expect(t.late).toBe(100)
    expect(t.received).toBe(230) // 100 Ana + 40 Diego + 90 Érica
    expect(t.toPay).toBe(260)
  })
  it('sem dados: nada', () => {
    expect(buildPersonRows(emptyData(), today)).toEqual([])
    expect(peopleTotals(emptyData(), today)).toEqual({ toReceive: 0, late: 0, received: 0, toPay: 0 })
  })
})

describe('pessoas: detalhe', () => {
  it('dívidas em aberto antes das quitadas; parcelas com estado e histórico desc', () => {
    const p = personDetail(dt, 'ÉRICA LIMA', today, fmt)!
    expect(p.name).toBe('Érica Lima')
    expect(p.debts.map((v) => v.debt.id)).toEqual(['e2', 'e1'])
    expect(p.hasReceivable && p.hasPayable).toBe(true)
    expect(p.totals).toMatchObject({ received: 90, toReceive: 0, owe: 60, paidOut: 0 })
    const ana = personDetail(dt, 'ana souza', today, fmt)!
    const parc = ana.debts.find((v) => v.debt.id === 'a1')!
    expect(parc.insts.map((i) => i.state)).toEqual(['paga', 'atrasada', 'aberta'])
    expect(parc.covered).toBe(1)
    expect(parc.progress).toBeCloseTo(100 / 3, 6)
    expect(ana.debts.find((v) => v.debt.id === 'a2')!.label).toBe('Churrasco')
    expect(ana.history).toEqual([
      expect.objectContaining({ date: '2026-02-10', amount: 100, dir: 'in', walletName: 'Nubank', debtLabel: 'Empréstimo de 10/01/2026 · 3x' }),
    ])
    expect(ana.totals).toMatchObject({ lent: 350, received: 100, toReceive: 250, overdue: 100 })
  })
  it('timing: paga com atraso / adiantada', () => {
    const d = base({ payments: [{ date: '2026-02-12', amount: 100 }, { date: '2026-02-20', amount: 100 }] })
    const p = personDetail(data({ debts: [d] }), 'fulano', today, fmt)!
    expect(p.debts[0].insts.map((i) => i.timing)).toEqual(['late', 'early', null])
  })
  it('pessoa inexistente → null', () => {
    expect(personDetail(dt, 'ninguém', today, fmt)).toBeNull()
  })
})

describe('pessoas: calendário e gráfico', () => {
  const ana = personDetail(dt, 'ana souza', today, fmt)!
  it('eventos do mês: paga mostra o valor, aberta o que falta', () => {
    const mar = personMonthEvents(ana, '2026-03')
    expect(mar.map((e) => [e.date, e.sub, e.amount, e.late, e.done])).toEqual([
      ['2026-03-10', 'parcela 2/3', 100, true, false],
      ['2026-03-20', 'parcela única', 50, false, false],
    ])
    expect(personMonthEvents(ana, '2026-02')[0]).toMatchObject({ done: true, amount: 100, dir: 'in' })
  })
  it('intervalo de meses e mês inicial', () => {
    expect(personMonthRange(ana, today)).toEqual({ min: '2026-02', max: '2026-04', initial: '2026-03' })
    const diego = personDetail(dt, 'diego', '2026-06-01', fmt)!
    expect(personMonthRange(diego, '2026-06-01')).toEqual({ min: '2026-02', max: '2026-06', initial: '2026-02' })
  })
  it('série acumulada junta pagamentos do mesmo dia', () => {
    const d = base({ payments: [{ date: '2026-02-01', amount: 10 }, { date: '2026-02-01', amount: 5 }, { date: '2026-01-20', amount: 1 }] })
    const p = personDetail(data({ debts: [d] }), 'fulano', today, fmt)!
    expect(paymentSeries(p, 'in')).toEqual([{ date: '2026-01-20', total: 1 }, { date: '2026-02-01', total: 16 }])
    expect(paymentSeries(p, 'out')).toEqual([])
  })
  it('demonstração tem pessoas em atraso, em dia e quitadas', () => {
    const t = '2026-10-23'
    const rows = buildPersonRows(buildDemoData(t), t)
    const c = filterCounts(rows, '')
    expect(c.atrasados).toBeGreaterThan(0)
    expect(c.quitados).toBeGreaterThan(0)
    expect(c.abertos).toBeGreaterThan(c.atrasados)
  })
})
