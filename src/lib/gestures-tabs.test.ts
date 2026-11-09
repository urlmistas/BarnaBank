import { describe, expect, it } from 'vitest'
import { BACK_COMMIT_DX, TAB_GESTURE_KEY, backFollow, neighborTab, readTabSwipe, tabSwipe, writeTabSwipe } from './gestures'

const p = (x: number, y: number, t = 0) => ({ x, y, t })

describe('gestos: deslizar entre abas', () => {
  it('rápido, na horizontal e longe da borda: esquerda = próxima, direita = anterior', () => {
    expect(tabSwipe(p(300, 300, 0), p(150, 310, 300))).toBe(1)
    expect(tabSwipe(p(100, 300, 0), p(250, 290, 300))).toBe(-1)
  })

  it('na borda esquerda é o "voltar", não troca de aba', () => {
    expect(tabSwipe(p(5, 300, 0), p(200, 300, 300))).toBe(0)
  })

  it('curto, inclinado ou lento não troca (para não brigar com a rolagem)', () => {
    expect(tabSwipe(p(300, 300, 0), p(250, 300, 200))).toBe(0)
    expect(tabSwipe(p(300, 300, 0), p(150, 380, 300))).toBe(0)
    expect(tabSwipe(p(300, 300, 0), p(150, 300, 900))).toBe(0)
  })

  it('vizinhas na ordem do menu, sem dar a volta; fora do menu não há', () => {
    const tabs = ['/', '/pessoas', '/carteiras']
    expect(neighborTab(tabs, '/pessoas', 1)).toBe('/carteiras')
    expect(neighborTab(tabs, '/pessoas', -1)).toBe('/')
    expect(neighborTab(tabs, '/', -1)).toBeNull()
    expect(neighborTab(tabs, '/carteiras', 1)).toBeNull()
    expect(neighborTab(tabs, '/pessoas/ana', 1)).toBeNull()
  })

  it('a tela acompanha o dedo com peso e teto; o voltar vale a partir do limite', () => {
    expect(backFollow(-5)).toBe(0)
    expect(backFollow(100)).toBe(60)
    expect(backFollow(1000)).toBe(140)
    expect(BACK_COMMIT_DX).toBe(70)
  })

  it('preferência: ligado por padrão; grava e lê', () => {
    const m = new Map<string, string>()
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    expect(readTabSwipe(s)).toBe(true)
    writeTabSwipe(false, s)
    expect(m.get(TAB_GESTURE_KEY)).toBe('0')
    expect(readTabSwipe(s)).toBe(false)
    writeTabSwipe(true, s)
    expect(readTabSwipe(s)).toBe(true)
  })
})
