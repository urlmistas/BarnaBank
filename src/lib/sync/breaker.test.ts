import { describe, expect, it } from 'vitest'
import { createBreaker } from './breaker'

describe('createBreaker', () => {
  it('uso normal não pausa', () => {
    let t = 0
    const b = createBreaker({ now: () => t })
    for (let i = 0; i < 20; i++) {
      t += 5000
      expect(b.record('pushed')).toBe(false)
    }
    expect(b.paused()).toBe(false)
  })

  it('vai e vem de dados (receber e enviar sem parar) pausa por 5 minutos e destrava sozinho', () => {
    let t = 0
    const b = createBreaker({ now: () => t })
    let tripped = false
    for (let i = 0; i < 10 && !tripped; i++) {
      t += 4000
      tripped = b.record('adopted') || b.record('pushed')
    }
    expect(tripped).toBe(true)
    expect(b.paused()).toBe(true)
    t += 4 * 60_000
    expect(b.paused()).toBe(true)
    t += 61_000
    expect(b.paused()).toBe(false)
  })

  it('ignora o que não troca dados e reset destrava', () => {
    const b = createBreaker({ limit: 2 })
    expect(b.record('noop')).toBe(false)
    expect(b.record('adopted')).toBe(true)
    expect(b.paused()).toBe(true)
    b.reset()
    expect(b.paused()).toBe(false)
  })
})
