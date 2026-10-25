import { describe, expect, it } from 'vitest'
import type { Debt } from '@/lib/types'
import { buildPersonRows } from './people'
import { allTags, notesOf, sortPeople, tagsOf, withTagsNotes } from './person-extra'
import { boardData, personReliability, trustInfo } from './trust'
import { greetName, waMoney, whatsappLink, whatsappMessage, whatsPhone } from './whatsapp'
import { makeDebtCalc } from './debts'

const money = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
const date = (iso: string) => iso.split('-').reverse().join('/')

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Ana Souza', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto', installments: 3, days: 90,
  date: '2026-01-10', dueDay: 10, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})

describe('confiança', () => {
  it('sem parcela vencida não há histórico', () => {
    expect(personReliability([debt({ date: '2026-03-10' })], 'ana souza', '2026-03-05')).toBeNull()
    expect(trustInfo([debt({ date: '2026-03-10' })], 'ana souza', '2026-03-05')).toBeNull()
  })

  it('conta parcelas em dia, atrasadas e a nota', () => {
    // parcelas 10/02, 10/03, 10/04: primeira paga em dia, segunda paga 5 dias depois, terceira ainda não venceu
    const d = debt({
      payments: [
        { id: 'a', date: '2026-02-10', amount: 100, mode: 'fifo' },
        { id: 'b', date: '2026-03-15', amount: 100, mode: 'fifo' },
      ],
    })
    const rel = personReliability([d], 'ana souza', '2026-03-20')!
    expect(rel).toMatchObject({ onTime: 1, late: 1, total: 2, pct: 50, avgDelay: 5, cls: 'bad', label: 'Costuma atrasar' })
    const t = trustInfo([d], 'ana souza', '2026-03-20')!
    // 100 * (0,6*0,5 + 0,4*(1-5/45)) = 65,6 → 66; pouco histórico não muda
    expect(t.score).toBe(66)
    expect(t.label).toBe('Regular')
    expect(t.lateNow).toBe(0)
  })

  it('atraso de agora tira pontos e o limite sugerido vem do maior empréstimo quitado', () => {
    const quitada = debt({ id: 'q', principal: 200, installments: 1, date: '2025-10-10', payments: [{ date: '2025-11-10', amount: 200, mode: 'fifo' }] })
    const atrasada = debt({ id: 'a', principal: 100, installments: 1, date: '2026-01-10' })
    const t = trustInfo([quitada, atrasada], 'ana souza', '2026-03-15')!
    expect(t.lateNow).toBe(100)
    expect(t.lateNowDays).toBeGreaterThan(0)
    expect(t.hasDone).toBe(true)
    expect(t.limit).toBe(t.score >= 85 ? 300 : t.score >= 70 ? 200 : t.score >= 50 ? 100 : 0)
  })

  it('dívida a pagar não conta', () => {
    expect(personReliability([debt({ kind: 'payable', date: '2026-01-01' })], 'ana souza', '2026-03-15')).toBeNull()
  })
})

describe('placar', () => {
  it('ordena por pontuação e dá medalhas', () => {
    const bom = debt({ id: 'b', name: 'Bom', principal: 100, installments: 2, date: '2026-01-10', payments: [
      { date: '2026-02-10', amount: 50, mode: 'fifo' }, { date: '2026-03-10', amount: 50, mode: 'fifo' },
    ] })
    const ruim = debt({ id: 'r', name: 'Ruim', principal: 100, installments: 2, date: '2026-01-10' })
    const rows = boardData([ruim, bom], '2026-03-15')
    expect(rows.map((r) => r.name)).toEqual(['Bom', 'Ruim'])
    expect(rows[0].medals.map((m) => m.label)).toContain('Mais pontual')
    expect(rows[1].medals.map((m) => m.label)).toContain('Rei do atraso')
    expect(rows[1].open).toBe(100)
  })

  it('sem empréstimos o placar fica vazio', () => {
    expect(boardData([debt({ kind: 'payable' })], '2026-03-15')).toEqual([])
  })
})

describe('whatsapp', () => {
  const ctx = { today: '2026-03-15', money, date }

  it('telefone: assume Brasil quando falta o DDI', () => {
    expect(whatsPhone({ phone: '(11) 99999-8888' })).toBe('5511999998888')
    expect(whatsPhone({ phone: '+55 11 99999-8888' })).toBe('5511999998888')
    expect(whatsPhone({})).toBe('')
    expect(whatsPhone(undefined)).toBe('')
  })

  it('nome da saudação e dinheiro sem espaço', () => {
    expect(greetName('Carlos (oficina)')).toBe('Carlos')
    expect(greetName('Ana Souza')).toBe('Ana')
    expect(waMoney((v) => 'R$ ' + v, 5)).toBe('R$5')
  })

  it('atrasada: fala das parcelas em aberto', () => {
    const d = debt() // 10/02 e 10/03 vencidas
    const msg = whatsappMessage(d, ctx)
    expect(msg).toContain('Oi Ana, tudo bem?')
    expect(msg).toContain('tem 2 parcelas em aberto, somando *R$200.00*'.replace('R$200.00', 'R$200,00'))
    expect(msg).toContain('(vencimento em 10/02/2026)')
  })

  it('em dia: próxima parcela; hoje: vence hoje', () => {
    expect(whatsappMessage(debt({ date: '2026-03-10' }), { ...ctx, today: '2026-03-05' })).toContain('Sua próxima parcela é de *R$100,00*, vencimento em 10/04/2026')
    expect(whatsappMessage(debt({ date: '2026-02-10' }), { ...ctx, today: '2026-03-10' })).toContain('sua parcela de *R$100,00* vence hoje')
  })

  it('conta dividida usa o título do grupo', () => {
    const emDia = debt({ installments: 1, principal: 50, date: '2026-03-10' })
    expect(whatsappMessage(emDia, { ...ctx, groupTitle: 'Churrasco' })).toContain('Sobre o *Churrasco*: sua parte ficou *R$50,00*, pra pagar até 10/04/2026')
    const atrasada = debt({ installments: 1, principal: 50, date: '2026-02-10' })
    expect(whatsappMessage(atrasada, { ...ctx, groupTitle: 'Churrasco' })).toContain('sua parte de *R$50,00* ficou em aberto (era até 10/03/2026)')
  })

  it('rodapé com Pix e link', () => {
    const d = debt({ date: '2026-03-10' })
    const msg = whatsappMessage(d, { ...ctx, today: '2026-03-05', pixKey: 'a@b.com', link: 'https://x.dev/s/abc' })
    expect(msg.endsWith('\n\n*Pix:* a@b.com\n*Detalhes:* https://x.dev/s/abc')).toBe(true)
  })

  it('link só existe com telefone', () => {
    const d = debt()
    expect(whatsappLink(d, {}, ctx)).toBeNull()
    const l = whatsappLink(d, { phone: '11999998888' }, ctx)!
    expect(l.startsWith('https://wa.me/5511999998888?text=')).toBe(true)
    expect(decodeURIComponent(l)).toContain('Oi Ana')
  })
})

describe('etiquetas e notas', () => {
  it('junta sugestões, as já usadas e as da pessoa sem repetir', () => {
    const all = allTags({ a: { phone: '', tags: ['Vizinho', 'Amigo'] }, b: { phone: '', tags: ['Vizinho'] } }, ['Primo'])
    expect(all).toContain('Vizinho')
    expect(all).toContain('Primo')
    expect(all.filter((t) => t === 'Amigo')).toHaveLength(1)
    expect(all[0]).toBe('Paga em dia')
  })

  it('troca só etiquetas e notas e limpa duplicadas e vazias', () => {
    const c = withTagsNotes({ phone: '11999998888' }, [' Amigo ', 'Amigo', '', 'x'.repeat(40)], '  recebe dia 5  ')
    expect(c.phone).toBe('11999998888')
    expect(tagsOf(c)).toEqual(['Amigo', 'x'.repeat(24)])
    expect(notesOf(c)).toBe('recebe dia 5')
    expect(withTagsNotes(undefined, [], '')).toEqual({ phone: '', tags: [], notes: '' })
  })

  it('tagsOf e notesOf toleram lixo', () => {
    expect(tagsOf({ phone: '', tags: 'x' })).toEqual([])
    expect(tagsOf(undefined)).toEqual([])
    expect(notesOf({ phone: '', notes: 3 })).toBe('')
  })
})

describe('ordenação da lista', () => {
  const rows = buildPersonRows(
    {
      debts: [
        debt({ id: '1', name: 'Zeca', principal: 100, installments: 1, date: '2026-03-01' }),
        debt({ id: '2', name: 'Ana', principal: 500, installments: 1, date: '2026-01-01' }),
        debt({ id: '3', name: 'Bia', principal: 300, installments: 1, date: '2026-02-01' }),
      ],
      contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [],
    },
    '2026-03-05',
    makeDebtCalc('2026-03-05'),
  )
  const names = (s: Parameters<typeof sortPeople>[1]) => sortPeople(rows, s).map((r) => r.name)

  it.each([
    ['name', ['Ana', 'Bia', 'Zeca']],
    ['valueDesc', ['Ana', 'Bia', 'Zeca']],
    ['valueAsc', ['Zeca', 'Bia', 'Ana']],
    ['recent', ['Zeca', 'Bia', 'Ana']],
    ['oldest', ['Ana', 'Bia', 'Zeca']],
  ] as const)('%s', (s, want) => expect(names(s)).toEqual(want))

  it('padrão: atrasados primeiro, depois o vencimento mais próximo', () => {
    // Ana (jan) venceu em fev: atrasada; Bia (fev) venceu em mar 10? 10/03 > hoje: em dia; Zeca em abril
    expect(names('due')[0]).toBe('Ana')
  })
})
