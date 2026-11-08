import { describe, expect, it } from 'vitest'
import { formatMonths, isMpWallet, potForecast } from './mercadopago'

describe('carteira Mercado Pago (antiga, criada sozinha)', () => {
  it('acha a carteira pelo nome, sem ligar para maiúscula ou espaço', () => {
    expect(isMpWallet({ name: '  mercado PAGO ' })).toBe(true)
    expect(isMpWallet({ name: 'Nubank' })).toBe(false)
  })
})

describe('previsão da meta de um porquinho', () => {
  const now = new Date('2026-11-08T12:00:00Z')
  const mov = (tipo: string, valor: number, at: string, pot = 'p1') => ({ id: at + tipo, at, tipo, valor, pot })
  it('sem meta: sem previsão; meta batida: pronto', () => {
    expect(potForecast({ id: 'p1', valor: 10, meta: 0, pct: 120 }, [], 0.05, now)).toBeNull()
    expect(potForecast({ id: 'p1', valor: 500, meta: 500, pct: 120 }, [], 0.05, now)).toEqual({ done: true })
  })
  it('usa o ritmo dos últimos 60 dias (guardado menos tirado, por mês)', () => {
    const movs = [mov('guardado', 100, '2026-10-10T12:00:00Z'), mov('guardar', 50, '2026-10-25T12:00:00Z'), mov('resgate', 30, '2026-11-01T12:00:00Z'), mov('guardado', 999, '2026-07-01T12:00:00Z'), mov('guardado', 999, '2026-10-20T12:00:00Z', 'outro')]
    const f = potForecast({ id: 'p1', valor: 100, meta: 700, pct: 0 }, movs, 0, now)
    expect(f).not.toBeNull()
    if (f && 'months' in f) {
      expect(f.perMonth).toBe(120) // (100 + 50 − 30) em 30 dias
      expect(f.months).toBe(5) // 100 + 5 × 120 = 700
    }
  })
  it('sem guardar nada e sem rendimento nunca chega; só com rendimento chega devagar', () => {
    expect(potForecast({ id: 'p1', valor: 100, meta: 200, pct: 0 }, [], 0, now)).toBeNull()
    const f = potForecast({ id: 'p1', valor: 100, meta: 110, pct: 120 }, [], 0.05, now)
    expect(f && 'months' in f && f.perMonth).toBe(0)
    expect(f && 'months' in f && f.months).toBeGreaterThan(1)
  })
  it('texto dos meses', () => {
    expect(formatMonths(1)).toBe('menos de 1 mês')
    expect(formatMonths(5)).toBe('~5 meses')
    expect(formatMonths(12)).toBe('~1 ano')
    expect(formatMonths(15)).toBe('~1 ano e 3 meses')
    expect(formatMonths(26)).toBe('~2 anos e 2 meses')
  })
})
