import { describe, expect, it } from 'vitest'
import type { AppData, Bill, Card } from '@/lib/types'
import { billRow, cardDetail, contasRows } from './contas'
import {
  billToInput, cardToInput, checkBillInput, checkBillPay, checkCardInput, checkInvoicePay, checkPurchaseInput, createBill, createCard,
  createPurchase, deleteBill, deleteCard, deletePurchase, emptyBillInput, emptyCardInput, emptyPurchaseInput, markBillPaid, payInvoice,
  relinkTransaction, unlinkTransaction, unmarkBill, updateBill, updateCard, type ContasStore,
} from './contas-mutations'

const TODAY = '2026-03-15'
const KEY = '2026-03'

const store = (over: Partial<ContasStore> = {}): ContasStore => ({ bills: [], cards: [], cardPurchases: [], cardPayments: [], transactions: [], ...over })
const asData = (s: ContasStore): AppData => ({ debts: [], contacts: {}, wallets: [], groups: [], ...s })
const bill = (over: Partial<Bill> = {}): Bill => ({ id: 'b1', name: 'Internet', amount: 100, kind: 'gasto', dueDay: 10, startMonth: '2026-01', paid: {}, active: true, ...over })
const card = (over: Partial<Card> = {}): Card => ({ id: 'c1', name: 'Nubank', closingDay: 5, dueDay: 12, limit: 1000, ...over })

describe('conta fixa: formulário', () => {
  const ok = { ...emptyBillInput(KEY, TODAY), name: ' Aluguel ', amount: 1500.456 }

  it('valida', () => {
    expect(checkBillInput({ ...ok, name: ' ' })).toMatch(/nome/)
    expect(checkBillInput({ ...ok, amount: 0 })).toMatch(/valor/)
    expect(checkBillInput({ ...ok, dueDay: 32 })).toMatch(/dia de vencimento/)
    expect(checkBillInput({ ...ok, dueDay: 0 })).toMatch(/dia de vencimento/)
    expect(checkBillInput(ok)).toBeNull()
  })

  it('cria ativa, sem pagamentos, com id b- e valor arredondado', () => {
    const b = createBill({ ...ok, category: ' Moradia ' }, KEY)
    expect(b).toMatchObject({ name: 'Aluguel', amount: 1500.46, dueDay: 15, category: 'Moradia', startMonth: KEY, active: true, paid: {}, kind: 'gasto' })
    expect(b.id).toMatch(/^b-/)
  })

  it('editar preserva pagamentos, active e endMonth', () => {
    const b = bill({ paid: { '2026-02': 'x' }, endMonth: '2026-12', active: false })
    const out = updateBill(b, { ...billToInput(b), name: 'Fibra', amount: 120 }, KEY)
    expect(out).toMatchObject({ name: 'Fibra', amount: 120, paid: { '2026-02': 'x' }, endMonth: '2026-12', active: false })
  })

  it('excluir tira só a conta', () => {
    const s = store({ bills: [bill(), bill({ id: 'b2' })] })
    deleteBill(s, 'b1')
    expect(s.bills.map((b) => b.id)).toEqual(['b2'])
  })
})

describe('marcar conta como paga', () => {
  it('com carteira: lança a transação e a tela de leitura mostra paga', () => {
    const s = store({ bills: [bill()] })
    expect(markBillPaid(s, 'b1', KEY, { amount: 95.5, date: '2026-03-08', walletId: 'w1' })).toBe(true)
    expect(s.transactions).toHaveLength(1)
    const tx = s.transactions[0]
    expect(tx).toMatchObject({ walletId: 'w1', type: 'gasto', amount: 95.5, date: '2026-03-08', category: 'Internet', note: 'Internet', auto: 'bill:b1:2026-03' })
    expect(s.bills[0].paid[KEY]).toBe(tx.id)
    const row = billRow(s.bills[0], KEY, asData(s), TODAY)
    expect(row).toMatchObject({ status: 'paga', paid: 95.5, paidDate: '2026-03-08', walletId: 'w1' })
  })

  it('sem carteira guarda "x" e não cria transação', () => {
    const s = store({ bills: [bill()] })
    markBillPaid(s, 'b1', KEY, { amount: 100, date: TODAY, walletId: '' })
    expect(s.bills[0].paid[KEY]).toBe('x')
    expect(s.transactions).toHaveLength(0)
    expect(billRow(s.bills[0], KEY, asData(s), TODAY).status).toBe('paga')
  })

  it('receita vira entrada', () => {
    const s = store({ bills: [bill({ kind: 'entrada', category: 'Salário' })] })
    markBillPaid(s, 'b1', KEY, { amount: 100, date: TODAY, walletId: 'w1' })
    expect(s.transactions[0]).toMatchObject({ type: 'entrada', category: 'Salário' })
  })

  it('desmarcar apaga a transação e volta a aberta', () => {
    const s = store({ bills: [bill()] })
    markBillPaid(s, 'b1', KEY, { amount: 100, date: TODAY, walletId: 'w1' })
    expect(unmarkBill(s, 'b1', KEY)).toBe(true)
    expect(s.transactions).toHaveLength(0)
    expect(s.bills[0].paid[KEY]).toBeUndefined()
    expect(billRow(s.bills[0], KEY, asData(s), TODAY).status).not.toBe('paga')
    expect(unmarkBill(s, 'b1', KEY)).toBe(false)
  })

  it('conta inexistente e dados inválidos', () => {
    expect(markBillPaid(store(), 'nope', KEY, { amount: 1, date: TODAY, walletId: '' })).toBe(false)
    expect(checkBillPay({ amount: 0, date: TODAY, walletId: '' })).toMatch(/maior que zero/)
    expect(checkBillPay({ amount: 5, date: '', walletId: '' })).toMatch(/data/)
    expect(checkBillPay({ amount: 5, date: TODAY, walletId: '' })).toBeNull()
  })
})

describe('cartão', () => {
  it('valida', () => {
    const ok = { ...emptyCardInput(), name: 'Inter' }
    expect(checkCardInput({ ...ok, name: '' })).toMatch(/nome/)
    expect(checkCardInput({ ...ok, closingDay: 0 })).toMatch(/dias entre 1 e 31/)
    expect(checkCardInput({ ...ok, dueDay: 40 })).toMatch(/dias entre 1 e 31/)
    expect(checkCardInput(ok)).toBeNull()
  })

  it('cria e edita', () => {
    const c = createCard({ name: ' Inter ', limit: 2500.999, closingDay: 3, dueDay: 10, walletId: 'w1' })
    expect(c).toMatchObject({ name: 'Inter', limit: 2501, closingDay: 3, dueDay: 10, walletId: 'w1' })
    expect(c.id).toMatch(/^c-/)
    expect(updateCard(c, { ...cardToInput(c), name: 'Inter Gold' })).toMatchObject({ id: c.id, name: 'Inter Gold', limit: 2501 })
  })

  it('excluir leva compras e pagamentos, mas mantém as transações das carteiras', () => {
    const s = store({
      cards: [card(), card({ id: 'c2', name: 'Outro' })],
      cardPurchases: [createPurchase('c1', { ...emptyPurchaseInput(TODAY), desc: 'a', amount: 10 }), createPurchase('c2', { ...emptyPurchaseInput(TODAY), desc: 'b', amount: 10 })],
      cardPayments: [{ id: 'cp-1', cardId: 'c1', invoice: KEY, amount: 5 }, { id: 'cp-2', cardId: 'c2', invoice: KEY, amount: 5 }],
      transactions: [{ id: 't1', walletId: 'w1', type: 'gasto', amount: 5, date: TODAY, auto: 'card:cp-1' }],
    })
    deleteCard(s, 'c1')
    expect(s.cards.map((c) => c.id)).toEqual(['c2'])
    expect(s.cardPurchases.map((p) => p.cardId)).toEqual(['c2'])
    expect(s.cardPayments.map((p) => p.cardId)).toEqual(['c2'])
    expect(s.transactions).toHaveLength(1)
  })
})

describe('compra no cartão', () => {
  const ok = { ...emptyPurchaseInput('2026-03-01'), desc: ' Tênis ', amount: 300, installments: 3 }

  it('valida', () => {
    expect(checkPurchaseInput({ ...ok, desc: '' })).toMatch(/Descreva/)
    expect(checkPurchaseInput({ ...ok, amount: 0 })).toMatch(/valor/)
    expect(checkPurchaseInput({ ...ok, installments: 49 })).toMatch(/1 a 48/)
    expect(checkPurchaseInput({ ...ok, installments: 1.5 })).toMatch(/1 a 48/)
    expect(checkPurchaseInput(ok)).toBeNull()
  })

  it('parcelas aparecem nas faturas seguintes (fecha dia 5)', () => {
    const s = store({ cards: [card()] })
    s.cardPurchases.push(createPurchase('c1', ok))
    expect(s.cardPurchases[0]).toMatchObject({ id: expect.stringMatching(/^p-/), cardId: 'c1', desc: 'Tênis', amount: 300, installments: 3 })
    const d = cardDetail(asData(s), 'c1', '2026-03', TODAY)!
    expect(d.invoice.charges).toBe(100)
    expect(d.items[0]).toMatchObject({ label: 'Tênis', i: 1, n: 3, value: 100 })
    expect(cardDetail(asData(s), 'c1', '2026-05', TODAY)!.invoice.charges).toBe(100)
    expect(d.used).toBe(300)
  })

  it('compra depois do fechamento cai na fatura seguinte', () => {
    const s = store({ cards: [card()] })
    s.cardPurchases.push(createPurchase('c1', { ...ok, date: '2026-03-10', installments: 1 }))
    expect(cardDetail(asData(s), 'c1', '2026-03', TODAY)!.invoice.charges).toBe(0)
    expect(cardDetail(asData(s), 'c1', '2026-04', TODAY)!.invoice.charges).toBe(300)
  })

  it('excluir tira todas as parcelas', () => {
    const s = store({ cards: [card()] })
    s.cardPurchases.push(createPurchase('c1', ok))
    deletePurchase(s, s.cardPurchases[0].id)
    expect(s.cardPurchases).toHaveLength(0)
    expect(cardDetail(asData(s), 'c1', '2026-04', TODAY)!.invoice.charges).toBe(0)
  })
})

describe('pagar fatura', () => {
  const setup = () => {
    const s = store({ cards: [card()] })
    s.cardPurchases.push(createPurchase('c1', { ...emptyPurchaseInput('2026-02-01'), desc: 'Mercado', amount: 200 }))
    return s
  }

  it('com carteira: cria pagamento e saída vinculados, e a fatura fica paga', () => {
    const s = setup()
    const pay = payInvoice(s, s.cards[0], '2026-02', { amount: 200, date: '2026-03-01', walletId: 'w1' })
    expect(s.cardPayments).toEqual([pay])
    expect(pay).toMatchObject({ id: expect.stringMatching(/^cp-/), cardId: 'c1', invoice: '2026-02', amount: 200, date: '2026-03-01' })
    const tx = s.transactions[0]
    expect(tx).toMatchObject({ walletId: 'w1', type: 'gasto', amount: 200, category: 'Cartão de crédito', note: 'Fatura Nubank (fev)', auto: 'card:' + pay.id })
    expect((pay as { txId?: string }).txId).toBe(tx.id)
    const d = cardDetail(asData(s), 'c1', '2026-02', TODAY)!
    expect(d.invoice.balance).toBe(0)
    expect(d.row.status).toBe('paga')
    expect(d.used).toBe(0)
  })

  it('sem carteira não lança transação', () => {
    const s = setup()
    const pay = payInvoice(s, s.cards[0], '2026-02', { amount: 50, date: '2026-03-01', walletId: '' })
    expect(s.transactions).toHaveLength(0)
    expect((pay as { txId?: string }).txId).toBeUndefined()
    expect(cardDetail(asData(s), 'c1', '2026-02', TODAY)!.invoice.balance).toBe(150)
  })

  it('pagamento parcial: o resto vai para a fatura seguinte depois do vencimento', () => {
    const s = setup()
    payInvoice(s, s.cards[0], '2026-02', { amount: 50, date: '2026-03-01', walletId: '' })
    const next = cardDetail(asData(s), 'c1', '2026-03', TODAY)!.invoice
    expect(next.carry).toBe(150)
    expect(next.total).toBe(150)
  })

  it('valida', () => {
    expect(checkInvoicePay({ amount: 0, date: TODAY, walletId: '' })).toMatch(/valor pago/)
    expect(checkInvoicePay({ amount: 5, date: '', walletId: '' })).toMatch(/data/)
    expect(checkInvoicePay({ amount: 5, date: TODAY, walletId: '' })).toBeNull()
  })
})

describe('vínculo com a carteira', () => {
  it('apagar a transação da conta paga reabre a conta, e o Desfazer religa', () => {
    const s = store({ bills: [bill()] })
    markBillPaid(s, 'b1', KEY, { amount: 100, date: TODAY, walletId: 'w1' })
    const tx = s.transactions[0]
    const u = unlinkTransaction(s, tx)
    expect(u).not.toBeNull()
    expect(s.bills[0].paid[KEY]).toBeUndefined()
    relinkTransaction(s, tx, u)
    expect(s.bills[0].paid[KEY]).toBe(tx.id)
  })

  it('apagar a saída do pagamento de fatura remove o pagamento, e o Desfazer devolve na mesma posição', () => {
    const s = store({ cards: [card()] })
    const p1 = payInvoice(s, s.cards[0], '2026-02', { amount: 10, date: TODAY, walletId: 'w1' })
    payInvoice(s, s.cards[0], '2026-03', { amount: 20, date: TODAY, walletId: 'w1' })
    const tx = s.transactions[0]
    const u = unlinkTransaction(s, tx)
    expect(s.cardPayments.map((p) => p.invoice)).toEqual(['2026-03'])
    relinkTransaction(s, tx, u)
    expect(s.cardPayments[0].id).toBe(p1.id)
  })

  it('transação comum não desvincula nada', () => {
    const s = store({ bills: [bill()] })
    expect(unlinkTransaction(s, { id: 't', auto: undefined })).toBeNull()
    expect(unlinkTransaction(s, { id: 't', auto: 'bill:b1:2026-03' })).toBeNull()
  })
})

describe('lista do mês', () => {
  it('conta nova entra na lista do mês de início', () => {
    const s = store()
    s.bills.push(createBill({ ...emptyBillInput(KEY, TODAY), name: 'Luz', amount: 80 }, KEY))
    expect(contasRows(asData(s), KEY, TODAY).map((r) => r.name)).toEqual(['Luz'])
    expect(contasRows(asData(s), '2026-02', TODAY)).toHaveLength(0)
  })
})
