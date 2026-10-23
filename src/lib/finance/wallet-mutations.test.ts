import { describe, expect, it } from 'vitest'
import type { StoreApi } from '@/lib/store'
import type { Debt, Transaction } from '@/lib/types'
import {
  checkTx, checkWallet, createTx, createWallet, emptyTxInput, findTxIndex, removeTx, removeWallet, txIdFromKey, txToInput, updateTx,
  updateWallet, usedCategories,
} from './wallet-mutations'

const TODAY = '2026-03-15'
const W = ['w1', 'w2']

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Ana', kind: 'receivable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30,
  date: '2026-01-10', dueDay: 10, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})

const api = (over: Partial<StoreApi> = {}): StoreApi => ({
  debts: [], contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [], raw: {}, ...over,
})

describe('carteira', () => {
  it('exige nome', () => {
    expect(checkWallet('  ')).toBe('Informe um nome.')
    expect(checkWallet('Nubank')).toBeNull()
  })

  it('cria com nome aparado e ícone padrão', () => {
    expect(createWallet(' Nubank ', '', 'x1')).toEqual({ id: 'x1', name: 'Nubank', icon: 'wallet' })
    expect(createWallet('Cofre', 'vault', 'x2').icon).toBe('vault')
  })

  it('editar mantém campos desconhecidos', () => {
    const w = { id: 'w1', name: 'A', icon: 'wallet', extra: 1 } as never
    expect(updateWallet(w, ' B ', 'car')).toMatchObject({ id: 'w1', name: 'B', icon: 'car', extra: 1 })
  })

  it('excluir apaga lançamentos de entrada, saída e transferência, e solta os pagamentos', () => {
    const a = api({
      wallets: [{ id: 'w1', name: 'A' }, { id: 'w2', name: 'B' }],
      transactions: [
        { id: 't1', walletId: 'w1', type: 'gasto', amount: 1, date: TODAY },
        { id: 't2', walletId: 'w2', toWalletId: 'w1', type: 'transferencia', amount: 2, date: TODAY },
        { id: 't3', walletId: 'w2', type: 'entrada', amount: 3, date: TODAY },
      ],
      debts: [
        debt({ payments: [{ date: TODAY, amount: 10, walletId: 'w1' }, { date: TODAY, amount: 5, walletId: 'w2' }] }),
        debt({ id: 'd2' }),
      ],
    })
    const untouched = a.debts[1]
    removeWallet(a, 'w1')
    expect(a.wallets.map((w) => w.id)).toEqual(['w2'])
    expect(a.transactions.map((t) => t.id)).toEqual(['t3'])
    expect(a.debts[0].payments[0]).toEqual({ date: TODAY, amount: 10 })
    expect(a.debts[0].payments[1].walletId).toBe('w2')
    expect(a.debts[1]).toBe(untouched)
  })
})

describe('lançamento', () => {
  const ok = { ...emptyTxInput(TODAY, 'w1'), type: 'gasto' as const, amount: 35.5, category: ' Mercado ', note: ' pão ' }

  it('valida', () => {
    expect(checkTx({ ...ok, walletId: '' }, W)).toBe('Selecione uma carteira.')
    expect(checkTx({ ...ok, walletId: 'zz' }, W)).toBe('Selecione uma carteira.')
    expect(checkTx({ ...ok, amount: 0 }, W)).toMatch(/maior que zero/)
    expect(checkTx({ ...ok, date: '' }, W)).toMatch(/data/)
    expect(checkTx({ ...ok, category: '  ' }, W)).toMatch(/categoria/)
    expect(checkTx(ok, W)).toBeNull()
  })

  it('transferência não pede categoria e exige destino diferente', () => {
    const t = { ...ok, type: 'transferencia' as const, category: '', toWalletId: 'w2' }
    expect(checkTx(t, W)).toBeNull()
    expect(checkTx({ ...t, toWalletId: 'w1' }, W)).toMatch(/destino diferente/)
    expect(checkTx({ ...t, toWalletId: '' }, W)).toMatch(/destino diferente/)
  })

  it('cria gasto com texto aparado e valor arredondado', () => {
    expect(createTx({ ...ok, amount: 10.005 }, 't1')).toEqual({
      id: 't1', walletId: 'w1', type: 'gasto', amount: 10.01, date: TODAY, category: 'Mercado', note: 'pão',
    })
  })

  it('cria transferência com categoria fixa e destino', () => {
    const t = createTx({ ...ok, type: 'transferencia', toWalletId: 'w2', category: 'x' }, 't2')
    expect(t).toMatchObject({ type: 'transferencia', category: 'Transferência', toWalletId: 'w2' })
  })

  it('editar de transferência para gasto tira o destino e guarda `auto`', () => {
    const tx: Transaction = { id: 't', walletId: 'w1', toWalletId: 'w2', type: 'transferencia', amount: 5, date: TODAY, category: 'Transferência', auto: 'bill:b:2026-03' }
    const out = updateTx(tx, { ...txToInput(tx), type: 'gasto', category: 'Luz' })
    expect(out.toWalletId).toBeUndefined()
    expect(out).toMatchObject({ type: 'gasto', category: 'Luz', auto: 'bill:b:2026-03' })
  })

  it('txToInput de transferência zera a categoria', () => {
    const i = txToInput({ id: 't', walletId: 'w1', toWalletId: 'w2', type: 'transferencia', amount: 5, date: TODAY, category: 'Transferência' })
    expect(i).toMatchObject({ type: 'transferencia', toWalletId: 'w2', category: '' })
  })

  it('chave do movimento → id do lançamento', () => {
    expect(txIdFromKey('t:abc')).toBe('abc')
    expect(txIdFromKey('t:abc:out')).toBe('abc')
    expect(txIdFromKey('t:abc:in')).toBe('abc')
    expect(txIdFromKey('t:i3')).toBe('i3')
    expect(txIdFromKey('p:d1:0')).toBeNull()
  })

  it('acha lançamento antigo sem id pela posição', () => {
    const list = [{ id: 'a' }, { walletId: 'w1' }, { id: 'c' }] as unknown as Transaction[]
    expect(findTxIndex(list, 'c')).toBe(2)
    expect(findTxIndex(list, 'i1')).toBe(1)
    expect(findTxIndex(list, 'i0')).toBe(-1)
    expect(findTxIndex(list, 'nada')).toBe(-1)
  })

  it('categorias usadas, sem repetir e sem transferência', () => {
    const list = [
      { id: '1', category: 'Mercado', type: 'gasto' },
      { id: '2', category: 'Mercado', type: 'gasto' },
      { id: '3', category: 'Transferência', type: 'transferencia' },
      { id: '4', category: 'Aluguel', type: 'gasto' },
    ] as Transaction[]
    expect(usedCategories(list)).toEqual(['Aluguel', 'Mercado'])
  })
})

describe('excluir lançamento', () => {
  const tx = (over: Partial<Transaction> = {}): Transaction => ({ id: 't1', walletId: 'w1', type: 'gasto', amount: 9, date: TODAY, category: 'x', ...over })

  it('lançamento comum só sai', () => {
    const a = api({ transactions: [tx(), tx({ id: 't2' })] })
    expect(removeTx(a, 't1')).toBe(true)
    expect(a.transactions.map((t) => t.id)).toEqual(['t2'])
  })

  it('id inexistente não muda nada', () => {
    const a = api({ transactions: [tx()] })
    expect(removeTx(a, 'zz')).toBe(false)
    expect(a.transactions).toHaveLength(1)
  })

  it('pagamento de conta fixa desmarca o mês', () => {
    const bill = { id: 'b1', name: 'Luz', amount: 9, kind: 'gasto', dueDay: 5, paid: { '2026-03': 't1', '2026-02': 'outro' } } as never
    const a = api({ transactions: [tx({ auto: 'bill:b1:2026-03' })], bills: [bill] })
    removeTx(a, 't1')
    expect(a.bills[0].paid).toEqual({ '2026-02': 'outro' })
  })

  it('conta marcada por outro lançamento não é desmarcada', () => {
    const bill = { id: 'b1', name: 'Luz', amount: 9, kind: 'gasto', dueDay: 5, paid: { '2026-03': 'outro' } } as never
    const a = api({ transactions: [tx({ auto: 'bill:b1:2026-03' })], bills: [bill] })
    removeTx(a, 't1')
    expect(a.bills[0].paid).toEqual({ '2026-03': 'outro' })
  })

  it('pagamento de fatura apaga o pagamento do cartão', () => {
    const a = api({
      transactions: [tx({ auto: 'card:p1' })],
      cardPayments: [{ id: 'p1', cardId: 'c', amount: 9, invoice: '2026-03' }, { id: 'p2', cardId: 'c', amount: 1, invoice: '2026-02' }],
    })
    removeTx(a, 't1')
    expect(a.cardPayments.map((p) => p.id)).toEqual(['p2'])
  })
})
