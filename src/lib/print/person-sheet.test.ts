import { describe, expect, it } from 'vitest'
import { personSheetHtml } from './documents'
import type { PersonDetail } from '@/lib/finance/people'
import type { PersonFacts } from '@/lib/finance/person-facts'

const ctx = {
  today: '2026-11-07', money: (v: number) => 'R$ ' + v.toFixed(2).replace('.', ','), date: (d: string) => d.split('-').reverse().join('/'),
  wallets: [], ownerName: '', ownerCity: '', issuedAt: new Date('2026-11-07T12:00:00'),
}

describe('personSheetHtml', () => {
  const p = {
    key: 'ana', name: 'Ana <Souza>', since: '2026-01-10', hasReceivable: true, hasPayable: false,
    totals: { lent: 300, received: 100, toReceive: 200, overdue: 50, owe: 0, paidOut: 0 },
    debts: [{ label: 'Moto', kind: 'receivable', paid: false, status: 'atrasado', total: 300, paidAmount: 100, remaining: 200, debt: { date: '2026-02-01' } }],
    history: [{ date: '2026-03-01', amount: 100, dir: 'in', debtLabel: 'Moto', note: 'pix' }],
  } as unknown as PersonDetail
  const facts: PersonFacts = { openCount: 1, paidCount: 0, nextDue: '2026-12-01', lastPayment: '2026-03-01', payoffDate: '2027-03-01', paymentsCount: 1, lateCount: 1, lateInstallments: 1, net: 200, status: 'late' }

  it('traz valores, resumo, dívidas e pagamentos, e escapa o nome', () => {
    const html = personSheetHtml({ p, facts, phone: '(11) 99999-8888', tags: ['Família'], notes: 'Paga dia 5' }, ctx)
    expect(html).toContain('Ficha individual')
    expect(html).toContain('Ana &lt;Souza&gt;')
    expect(html).not.toContain('Ana <Souza>')
    expect(html).toContain('Falta receber')
    expect(html).toContain('R$ 200,00')
    expect(html).toContain('Em atraso')
    expect(html).toContain('01/12/2026')
    expect(html).toContain('Atrasada')
    expect(html).toContain('Moto · pix')
    expect(html).toContain('(11) 99999-8888 · Família')
    expect(html).toContain('Paga dia 5')
  })

  it('sem anotações nem pagamentos, não cria essas seções', () => {
    const html = personSheetHtml({ p: { ...p, history: [] } as PersonDetail, facts, phone: '', tags: [], notes: '' }, ctx)
    expect(html).not.toContain('Anotações')
    expect(html).not.toContain('Últimos pagamentos')
  })
})
