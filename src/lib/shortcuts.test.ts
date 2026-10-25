import { describe, expect, it } from 'vitest'
import { resolveKey, type KeyInfo } from './shortcuts'

const k = (key: string, over: Partial<KeyInfo> = {}): KeyInfo => ({ key, ctrl: false, meta: false, alt: false, typing: false, dialogOpen: false, ...over })

describe('resolveKey', () => {
  it('Ctrl/⌘+K e "/" abrem a busca', () => {
    expect(resolveKey(k('k', { ctrl: true }), false, true).action).toBe('search')
    expect(resolveKey(k('K', { meta: true }), false, false).action).toBe('search')
    expect(resolveKey(k('/'), false, true).action).toBe('search')
  })

  it('não dispara digitando em campo nem com janela aberta', () => {
    expect(resolveKey(k('h', { typing: true }), false, true).handled).toBe(false)
    expect(resolveKey(k('/', { typing: true }), false, true).handled).toBe(false)
    expect(resolveKey(k('s', { dialogOpen: true }), false, true).handled).toBe(false)
    expect(resolveKey(k('k', { ctrl: true, dialogOpen: true }), false, true).handled).toBe(false)
  })

  it('teclas simples', () => {
    expect(resolveKey(k('s'), false, true).action).toBe('simulator')
    expect(resolveKey(k('H'), false, true).action).toBe('hide')
    expect(resolveKey(k('t'), false, true).action).toBe('theme')
    expect(resolveKey(k('?'), false, true).action).toBe('help')
  })

  it('com os atalhos de uma tecla desligados, só a busca vale', () => {
    expect(resolveKey(k('h'), false, false).handled).toBe(false)
    expect(resolveKey(k('g'), false, false).chord).toBe(false)
    expect(resolveKey(k('/'), false, false).action).toBe('search')
  })

  it('G e depois a letra vai para a tela', () => {
    const g = resolveKey(k('g'), false, true)
    expect(g).toEqual({ action: null, chord: true, handled: true })
    expect(resolveKey(k('p'), true, true).action).toEqual({ go: '/pessoas' })
    expect(resolveKey(k(','), true, true).action).toEqual({ go: '/configuracoes' })
    expect(resolveKey(k('x'), true, true).handled).toBe(false)
  })

  it('combinação com Ctrl/Alt não vira atalho', () => {
    expect(resolveKey(k('h', { ctrl: true }), false, true).handled).toBe(false)
    expect(resolveKey(k('s', { alt: true }), false, true).handled).toBe(false)
  })
})
