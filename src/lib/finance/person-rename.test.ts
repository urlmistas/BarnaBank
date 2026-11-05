import { describe, expect, it } from 'vitest'
import type { StoreApi } from '@/lib/store'
import type { Debt } from '@/lib/types'
import { cleanName, mergeContacts, nameError, nameTaken, renamePerson } from './person-rename'

const debt = (id: string, name: string): Debt => ({
  id, name, kind: 'receivable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30,
  date: '2026-10-01', dueDay: 5, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '',
})
const api = (over: Partial<StoreApi> = {}): StoreApi => ({
  debts: [], contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [], raw: {}, ...over,
})

describe('renamePerson', () => {
  it('troca o nome em todas as dívidas da pessoa e só nelas', () => {
    const a = api({ debts: [debt('1', 'Leo'), debt('2', 'leo '), debt('3', 'Ana')] })
    expect(renamePerson(a, 'leo', 'Leonardo Silva')).toBe('leonardo silva')
    expect(a.debts.map((d) => d.name)).toEqual(['Leonardo Silva', 'Leonardo Silva', 'Ana'])
  })

  it('leva o contato para a chave nova e apaga a antiga', () => {
    const a = api({ debts: [debt('1', 'Leo')], contacts: { leo: { phone: '11999998888', tags: ['Amigo'], notes: 'oi' } } })
    renamePerson(a, 'leo', 'Leonardo')
    expect(a.contacts).toEqual({ leonardo: { phone: '11999998888', tags: ['Amigo'], notes: 'oi' } })
  })

  it('atualiza os links de pessoa e "eu devo", sem mexer nos de dívida e grupo', () => {
    const a = api({
      debts: [debt('1', 'Leo')],
      raw: {
        shares: {
          AAAAAAAAAAAAAAAA: { type: 'person', ref: 'leo', created: '2026-01-01' },
          BBBBBBBBBBBBBBBB: { type: 'owe', ref: 'leo' },
          CCCCCCCCCCCCCCCC: { type: 'debt', ref: 'leo' },
          DDDDDDDDDDDDDDDD: { type: 'person', ref: 'ana' },
        },
      },
    })
    renamePerson(a, 'leo', 'Leonardo')
    const s = a.raw.shares as Record<string, { ref: string }>
    expect(s.AAAAAAAAAAAAAAAA.ref).toBe('leonardo')
    expect(s.BBBBBBBBBBBBBBBB.ref).toBe('leonardo')
    expect(s.CCCCCCCCCCCCCCCC.ref).toBe('leo')
    expect(s.DDDDDDDDDDDDDDDD.ref).toBe('ana')
  })

  it('só mudou maiúscula ou espaço: mesma chave, contato e links ficam', () => {
    const a = api({ debts: [debt('1', 'leo')], contacts: { leo: { phone: '1' } } })
    expect(renamePerson(a, 'leo', '  LEO  ')).toBe('leo')
    expect(a.debts[0].name).toBe('LEO')
    expect(a.contacts).toEqual({ leo: { phone: '1' } })
  })

  it('nome que já existe junta as duas pessoas e os contatos', () => {
    const a = api({
      debts: [debt('1', 'Leo'), debt('2', 'Leonardo')],
      contacts: { leo: { phone: '111', tags: ['Amigo'], notes: 'a' }, leonardo: { phone: '', tags: ['Família'], notes: 'b' } },
    })
    renamePerson(a, 'leo', 'LEONARDO')
    expect(a.debts.map((d) => d.name)).toEqual(['Leonardo', 'Leonardo'])
    expect(a.contacts.leo).toBeUndefined()
    expect(a.contacts.leonardo).toEqual({ phone: '111', tags: ['Família', 'Amigo'], notes: 'b\na' })
  })
})

describe('validação', () => {
  it('cleanName e nameError', () => {
    expect(cleanName('  Leo   Silva ')).toBe('Leo Silva')
    expect(nameError('   ')).toBe('Informe o nome.')
    expect(nameError('x'.repeat(61))).toMatch(/até 60/)
    expect(nameError('Leo')).toBeNull()
  })

  it('nameTaken: outra pessoa com o nome, por dívida ou contato; a própria não conta', () => {
    const d = { debts: [debt('1', 'Leo'), debt('2', 'Ana')], contacts: { bia: { phone: '' } } }
    expect(nameTaken(d, 'leo', 'ana')).toBe(true)
    expect(nameTaken(d, 'leo', ' BIA ')).toBe(true)
    expect(nameTaken(d, 'leo', 'LEO')).toBe(false)
    expect(nameTaken(d, 'leo', 'Novo')).toBe(false)
  })

  it('mergeContacts mantém o telefone de quem tem', () => {
    expect(mergeContacts({ phone: '' }, { phone: '9' }).phone).toBe('9')
    expect(mergeContacts({ phone: '1' }, { phone: '9' }).phone).toBe('1')
  })
})
