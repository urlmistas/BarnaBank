import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/types'
import { reconcile, type StatementLine } from './reconcile'

const tx = (id: string, type: Transaction['type'], amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({ id, walletId: 'w1', type, amount, date, ...extra })
const line = (date: string, amount: number, desc = 'x', imp = 'h:' + date + amount): StatementLine => ({ date, amount, desc, imp })

describe('conferir extrato × carteira', () => {
  it('sem linhas: nada a conferir', () => {
    expect(reconcile([], [], 'w1')).toBeNull()
  })

  it('casa por valor e data (até 2 dias), separa o que falta e o que sobra no app', () => {
    const txs = [
      tx('a', 'gasto', 30, '2026-11-02'), // extrato dia 3: casa
      tx('b', 'entrada', 1000, '2026-11-05'), // casa
      tx('c', 'gasto', 99, '2026-11-06'), // está no app, não está no extrato
      tx('d', 'gasto', 12, '2026-10-01'), // fora do período do extrato: não conta como sobra
    ]
    const r = reconcile([line('2026-11-03', -30), line('2026-11-05', 1000), line('2026-11-07', -45)], txs, 'w1')!
    expect(r.matched.map((l) => l.amount)).toEqual([-30, 1000])
    expect(r.missing.map((l) => l.amount)).toEqual([-45])
    expect(r.extra.map((t) => t.id)).toEqual(['c'])
    expect([r.from, r.to]).toEqual(['2026-11-03', '2026-11-07'])
  })

  it('3 dias de diferença já não casa', () => {
    const r = reconcile([line('2026-11-06', -30)], [tx('a', 'gasto', 30, '2026-11-03')], 'w1')!
    expect(r.matched).toHaveLength(0)
    expect(r.missing).toHaveLength(1)
  })

  it('cada lançamento casa uma linha só: dois gastos iguais no extrato e um no app → um falta', () => {
    const r = reconcile([line('2026-11-03', -30, 'a', 'k1'), line('2026-11-03', -30, 'b', 'k2')], [tx('a', 'gasto', 30, '2026-11-03')], 'w1')!
    expect(r.matched).toHaveLength(1)
    expect(r.missing).toHaveLength(1)
  })

  it('o sinal conta: gasto no app não casa com entrada do mesmo valor', () => {
    const r = reconcile([line('2026-11-03', 30)], [tx('a', 'gasto', 30, '2026-11-03')], 'w1')!
    expect(r.matched).toHaveLength(0)
  })

  it('casa pela chave de importação mesmo com data e valor diferentes', () => {
    const r = reconcile([line('2026-11-09', -31.5, 'mercado', 'f:123')], [tx('a', 'gasto', 30, '2026-11-01', { imp: 'f:123' })], 'w1')!
    expect(r.matched).toHaveLength(1)
  })

  it('transferência: sai da origem, entra no destino; outra carteira não conta', () => {
    const t = tx('t', 'transferencia', 200, '2026-11-04', { toWalletId: 'w2' })
    expect(reconcile([line('2026-11-04', -200)], [t], 'w1')!.matched).toHaveLength(1)
    expect(reconcile([line('2026-11-04', 200)], [t], 'w2')!.matched).toHaveLength(1)
    expect(reconcile([line('2026-11-04', -200)], [t], 'w3')!.matched).toHaveLength(0)
  })
})
