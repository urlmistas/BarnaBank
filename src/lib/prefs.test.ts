import { describe, expect, it } from 'vitest'
import { applyPrefs, cleanPrefs, PREFS_KEY, readPrefs, writePrefs } from './prefs'
import { resolveTheme } from '@/app/theme'

function mem() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}
const base = { currency: 'BRL', dateFormat: 'dmy', ownerName: 'Ana', pixKey: 'x' }

describe('preferências de exibição', () => {
  it('sem escolha, valem as configurações do app antigo', () => {
    expect(applyPrefs(base, {})).toEqual(base)
  })
  it('a escolha deste app vale por cima, sem apagar o resto', () => {
    expect(applyPrefs(base, { currency: 'EUR', dateFormat: 'iso' })).toEqual({ ...base, currency: 'EUR', dateFormat: 'iso' })
  })
  it('valores desconhecidos são ignorados', () => {
    expect(cleanPrefs({ currency: 'JPY', dateFormat: 'iso', extra: 1 })).toEqual({ dateFormat: 'iso' })
    expect(cleanPrefs(null)).toEqual({})
  })
  it('grava só em bbweb_prefs; sem escolha, apaga a chave', () => {
    const st = mem()
    writePrefs({ currency: 'USD' }, st)
    expect([...st.m.keys()]).toEqual([PREFS_KEY])
    expect(PREFS_KEY.startsWith('bbweb_')).toBe(true)
    expect(readPrefs(st)).toEqual({ currency: 'USD' })
    writePrefs({}, st)
    expect(st.m.size).toBe(0)
  })
  it('JSON corrompido → sem preferências', () => {
    const st = mem()
    st.setItem(PREFS_KEY, '{x')
    expect(readPrefs(st)).toEqual({})
  })
})

describe('tema', () => {
  it('"sistema" segue o sistema; claro/escuro são fixos', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
