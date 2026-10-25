import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY } from '@/lib/storage'
import { commitSettings } from '@/lib/store'
import { defaultsPatch, numText, parsePercent, pixPatch } from './settings'

describe('parsePercent', () => {
  it.each([
    ['2,5', undefined, 2.5],
    ['2.5', undefined, 2.5],
    ['', undefined, 0],
    ['abc', undefined, 0],
    ['-3', undefined, 0],
    ['150', 100, 100],
    ['150', undefined, 150],
  ])('%s (máx %s) → %d', (text, max, out) => expect(parsePercent(text, max)).toBe(out))
})

describe('defaultsPatch', () => {
  const f = { defaultRate: '5', defaultLateFee: '200', defaultLateInterest: '1,5', defaultWalletId: 'w1' }
  it('limita multa e mora a 100 e aceita carteira que existe', () => {
    expect(defaultsPatch(f, ['w1'])).toEqual({ defaultRate: 5, defaultLateFee: 100, defaultLateInterest: 1.5, defaultWalletId: 'w1' })
  })
  it('carteira que sumiu volta a vazio', () => {
    expect(defaultsPatch(f, ['w2']).defaultWalletId).toBe('')
  })
})

describe('pixPatch', () => {
  it('apara, limita tamanhos e troca tipo inválido por auto', () => {
    const out = pixPatch({ pixKey: '  ' + 'x'.repeat(130) + ' ', pixType: 'zzz', ownerName: ' João ', ownerCity: ' São Paulo da Silva Souza ' })
    expect((out.pixKey as string).length).toBe(120)
    expect(out.pixType).toBe('auto')
    expect(out.ownerName).toBe('João')
    expect((out.ownerCity as string).length).toBeLessThanOrEqual(15)
  })
})

describe('numText', () => {
  it('zero e não número ficam vazios', () => {
    expect(numText(0)).toBe('')
    expect(numText('x')).toBe('')
    expect(numText(2.5)).toBe('2.5')
  })
})

describe('commitSettings', () => {
  let m: Map<string, string>
  beforeEach(() => {
    m = new Map()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) })
    vi.stubGlobal('dispatchEvent', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('junta ao que existe e preserva chaves desconhecidas', () => {
    m.set(SETTINGS_KEY, JSON.stringify({ currency: 'USD', coisaNova: 1 }))
    const r = commitSettings({ pixKey: 'a@b.com' })
    expect(r.ok).toBe(true)
    expect(JSON.parse(m.get(SETTINGS_KEY)!)).toEqual({ currency: 'USD', coisaNova: 1, pixKey: 'a@b.com' })
  })

  it('undefined apaga a chave', () => {
    m.set(SETTINGS_KEY, JSON.stringify({ a: 1, b: 2 }))
    commitSettings({ a: undefined })
    expect(JSON.parse(m.get(SETTINGS_KEY)!)).toEqual({ b: 2 })
  })

  it('recusa JSON corrompido sem sobrescrever e avisa o app quando grava', () => {
    m.set(SETTINGS_KEY, '{quebrado')
    expect(commitSettings({ a: 1 }).ok).toBe(false)
    expect(m.get(SETTINGS_KEY)).toBe('{quebrado')
    m.delete(SETTINGS_KEY)
    const dispatch = vi.fn()
    vi.stubGlobal('dispatchEvent', dispatch)
    commitSettings({ a: 1 })
    expect(dispatch).toHaveBeenCalled()
  })
})
