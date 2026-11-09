import { describe, expect, it } from 'vitest'
import { PEAK, SHAKE_KEY, accelOf, makeShakeDetector, readShake, writeShake } from './shake'

function run(samples: [number, number][]) {
  let t = 0
  const d = makeShakeDetector(() => t)
  return samples.map(([at, a]) => {
    t = at
    return d(a)
  })
}

describe('sacudir', () => {
  it('duas batidas fortes em menos de 1 s = sacudida', () => {
    expect(run([[0, 3], [100, PEAK + 5], [200, 2], [400, PEAK + 5]])).toEqual([false, false, false, true])
  })

  it('uma batida só, ou duas muito afastadas, não vale', () => {
    expect(run([[0, PEAK + 5], [100, 1]])).toEqual([false, false])
    expect(run([[0, PEAK + 5], [100, 1], [1500, PEAK + 5]])).toEqual([false, false, false])
  })

  it('leituras seguidas da mesma batida contam uma vez só', () => {
    expect(run([[0, PEAK + 5], [30, PEAK + 8], [60, PEAK + 3], [90, 1]])).toEqual([false, false, false, false])
  })

  it('depois de sacudir, espera 2 s antes de aceitar outra', () => {
    const r = run([
      [0, PEAK + 1], [100, 1], [200, PEAK + 1], // sacudiu em 200
      [300, 1], [600, PEAK + 1], [700, 1], [800, PEAK + 1], // dentro dos 2 s: ignora
      [2500, 1], [2600, PEAK + 1], [2700, 1], [2800, PEAK + 1], // passou o tempo: vale
    ])
    expect(r[2]).toBe(true)
    expect(r.slice(3, 7)).toEqual([false, false, false, false])
    expect(r[10]).toBe(true)
  })

  it('aceleração: usa a sem gravidade; sem ela, o módulo da gravidade menos 9,81', () => {
    expect(accelOf({ acceleration: { x: 3, y: 4, z: 0 }, accelerationIncludingGravity: null })).toBe(5)
    expect(accelOf({ acceleration: null, accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } })).toBeCloseTo(0, 5)
    expect(accelOf({ acceleration: { x: null, y: null, z: null }, accelerationIncludingGravity: { x: 0, y: 0, z: 29.81 } })).toBeCloseTo(20, 5)
    expect(accelOf({ acceleration: null, accelerationIncludingGravity: null })).toBe(0)
  })

  it('preferência: desligada por padrão', () => {
    const m = new Map<string, string>()
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    expect(readShake(s)).toBe(false)
    writeShake(true, s)
    expect(m.get(SHAKE_KEY)).toBe('1')
    expect(readShake(s)).toBe(true)
  })
})
