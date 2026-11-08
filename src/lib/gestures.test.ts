import { describe, expect, it } from 'vitest'
import { EDGE_PX, PULL_THRESHOLD, isBackSwipe, isPullStart, pullDistance } from './gestures'

const p = (x: number, y: number, t = 0) => ({ x, y, t })

describe('gestos: voltar', () => {
  it('da borda esquerda para a direita, rápido e na horizontal: volta', () => {
    expect(isBackSwipe(p(5, 300, 0), p(120, 310, 300))).toBe(true)
    expect(isBackSwipe(p(EDGE_PX, 300, 0), p(EDGE_PX + 70, 300, 200))).toBe(true)
  })

  it('começando no meio da tela não volta (não rouba rolagem horizontal nem toques)', () => {
    expect(isBackSwipe(p(EDGE_PX + 1, 300, 0), p(220, 300, 200))).toBe(false)
  })

  it('curto, lento, para a esquerda ou muito inclinado não volta', () => {
    expect(isBackSwipe(p(5, 300, 0), p(60, 300, 200))).toBe(false)
    expect(isBackSwipe(p(5, 300, 0), p(150, 300, 1000))).toBe(false)
    expect(isBackSwipe(p(5, 300, 0), p(-50, 300, 200))).toBe(false)
    expect(isBackSwipe(p(5, 300, 0), p(100, 400, 200))).toBe(false)
  })
})

describe('gestos: puxar para atualizar', () => {
  it('só conta descendo mais na vertical que na horizontal', () => {
    expect(isPullStart(2, 20)).toBe(true)
    expect(isPullStart(30, 20)).toBe(false)
    expect(isPullStart(0, 3)).toBe(false)
    expect(isPullStart(0, -30)).toBe(false)
  })

  it('o indicador anda metade do dedo, com teto, e exige o limite para valer', () => {
    expect(pullDistance(-10)).toBe(0)
    expect(pullDistance(100)).toBe(50)
    expect(pullDistance(1000)).toBe(96)
    expect(pullDistance(100)).toBeLessThan(PULL_THRESHOLD)
    expect(pullDistance(140)).toBeGreaterThanOrEqual(PULL_THRESHOLD)
  })
})
