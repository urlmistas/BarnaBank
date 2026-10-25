import { describe, expect, it } from 'vitest'
import type { AppData } from '@/lib/types'
import { emptyData } from '@/lib/storage'
import { alertText, hideAlert, readHiddenAlerts, spendingAlerts } from './alerts'

const gasto = (id: string, date: string, amount: number, category: string) => ({ id, walletId: 'a', type: 'gasto' as const, amount, date, category })
const data = (tx: ReturnType<typeof gasto>[]): AppData => ({ ...emptyData(), wallets: [{ id: 'a', name: 'Conta', icon: 'landmark' }], transactions: tx })
const money = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
const TODAY = '2026-10-15'

describe('spendingAlerts', () => {
  it('sem histórico nenhum, não alerta', () => {
    expect(spendingAlerts(data([gasto('1', '2026-10-02', 900, 'Mercado')]), TODAY)).toEqual([])
  })

  it('categoria 50% acima da média e com pelo menos R$ 50 a mais', () => {
    const d = data([
      gasto('1', '2026-07-10', 100, 'Mercado'), gasto('2', '2026-08-10', 100, 'Mercado'), gasto('3', '2026-09-10', 100, 'Mercado'),
      gasto('4', '2026-10-02', 160, 'Mercado'),
      gasto('5', '2026-07-12', 100, 'Lazer'), gasto('6', '2026-08-12', 100, 'Lazer'), gasto('7', '2026-09-12', 100, 'Lazer'),
      gasto('8', '2026-10-03', 120, 'Lazer'),
    ])
    const out = spendingAlerts(d, TODAY)
    expect(out.map((a) => [a.name, a.cur, a.avg])).toEqual([['Mercado', 160, 100]])
    expect(alertText(out[0], money)).toBe('+60% da sua média (R$ 100,00)')
  })

  it('o dobro ou mais vira "Nx"; pouca diferença em reais não alerta', () => {
    const d = data([
      gasto('1', '2026-09-10', 100, 'Mercado'), gasto('2', '2026-10-02', 250, 'Mercado'),
      gasto('3', '2026-09-11', 10, 'Café'), gasto('4', '2026-10-03', 30, 'Café'),
    ])
    const out = spendingAlerts(d, TODAY)
    expect(out.map((a) => a.name)).toEqual(['Mercado'])
    expect(alertText(out[0], money)).toBe('2,5x da sua média (R$ 100,00)')
  })

  it('categoria nova só alerta a partir de R$ 300 e com 2 meses de histórico', () => {
    const base = [gasto('1', '2026-08-10', 50, 'Outros'), gasto('2', '2026-09-10', 50, 'Outros')]
    const out = spendingAlerts(data([...base, gasto('3', '2026-10-02', 300, 'Viagem')]), TODAY)
    expect(out.map((a) => a.name)).toEqual(['Viagem'])
    expect(alertText(out[0], money)).toBe('gasto novo, sem histórico')
    expect(spendingAlerts(data([gasto('1', '2026-09-10', 50, 'Outros'), gasto('3', '2026-10-02', 300, 'Viagem')]), TODAY)).toEqual([])
  })
})

describe('alertas escondidos', () => {
  it('guarda por mês e categoria, na chave do app antigo', () => {
    const mem = new Map<string, string>()
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    expect(readHiddenAlerts(st)).toEqual({})
    hideAlert('2026-10', 'mercado', st)
    hideAlert('2026-10', 'lazer', st)
    expect(readHiddenAlerts(st)).toEqual({ '2026-10:mercado': 1, '2026-10:lazer': 1 })
    expect(mem.has('barnabank_alerts_hide')).toBe(true)
  })
})
