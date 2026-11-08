import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/types'
import type { MpMov } from '@/lib/sync/mpconta'
import { mpImpKey, mpNewTransactions } from './mercadopago'

const mov = (o: Partial<MpMov>): MpMov => ({ id: '1', at: '2026-11-07T14:30:00.000Z', tipo: 'saida', label: 'Pix enviado', valor: 15, sinal: -1, pot: '', ...o })

describe('mpNewTransactions', () => {
  it('vira gasto ou entrada na carteira, com a data de Brasília', () => {
    const r = mpNewTransactions([mov({}), mov({ id: '2', tipo: 'entrada', label: 'Pix recebido', valor: 100, sinal: 1, at: '2026-11-08T02:30:00.000Z' })], 'w1', [])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ id: 'mp1', walletId: 'w1', type: 'gasto', amount: 15, date: '2026-11-07', category: 'Transferências', imp: 'mp:1' })
    expect(r[1]).toMatchObject({ type: 'entrada', amount: 100, category: 'Pix recebido', date: '2026-11-07' }) // 23h30 do dia 7 em Brasília
  })
  it('não lança duas vezes', () => {
    const have = [{ id: 'x', walletId: 'w1', type: 'gasto', amount: 15, date: '2026-11-07', imp: mpImpKey('1') }] as Transaction[]
    expect(mpNewTransactions([mov({}), mov({ id: '3', valor: 7 })], 'w1', have).map((t) => t.id)).toEqual(['mp3'])
  })
  it('guardado e resgate de porquinho não entram', () => {
    expect(mpNewTransactions([mov({ tipo: 'guardar' }), mov({ id: '2', tipo: 'resgate', sinal: 1 })], 'w1', [])).toEqual([])
  })
  it('ignora valor zero e data inválida', () => {
    expect(mpNewTransactions([mov({ valor: 0 }), mov({ id: '2', at: 'xx' })], 'w1', [])).toEqual([])
  })
})
