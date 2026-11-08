import { describe, expect, it } from 'vitest'
import { LOCK_KEY, checkPin, lockoutMs, makeLock, readLock, shouldRelock, validPin, writeLock } from './lock'

class Mem {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

describe('bloqueio do app', () => {
  it('PIN: 4 a 8 números', () => {
    expect(validPin('1234')).toBe(true)
    expect(validPin('12345678')).toBe(true)
    expect(validPin('123')).toBe(false)
    expect(validPin('123456789')).toBe(false)
    expect(validPin('12a4')).toBe(false)
    expect(validPin('')).toBe(false)
  })

  it('guarda só o hash (nunca o PIN), confere o certo e recusa o errado', async () => {
    const cfg = await makeLock('4821', 5)
    expect(JSON.stringify(cfg)).not.toContain('4821')
    expect(cfg.after).toBe(5)
    expect(await checkPin(cfg, '4821')).toBe(true)
    expect(await checkPin(cfg, '4822')).toBe(false)
    expect(await checkPin(cfg, '')).toBe(false)
    expect(await checkPin(cfg, 'abcd')).toBe(false)
  })

  it('o mesmo PIN gera hash diferente a cada configuração (sal próprio)', async () => {
    const a = await makeLock('1111')
    const b = await makeLock('1111')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it('PIN inválido não vira configuração', async () => {
    await expect(makeLock('12')).rejects.toThrow(/4 a 8/)
  })

  it('lê e grava; configuração estragada vira "sem bloqueio"; apagar remove', async () => {
    const s = new Mem()
    expect(readLock(s)).toBeNull()
    const cfg = await makeLock('9090', 15, 'credX')
    writeLock(cfg, s)
    expect(readLock(s)).toEqual(cfg)
    s.setItem(LOCK_KEY, '{ruim')
    expect(readLock(s)).toBeNull()
    s.setItem(LOCK_KEY, JSON.stringify({ salt: 's', hash: 'h', after: 7 }))
    expect(readLock(s)?.after).toBe(0) // valor desconhecido: o mais seguro
    s.setItem(LOCK_KEY, JSON.stringify({ salt: '', hash: 'h' }))
    expect(readLock(s)).toBeNull()
    writeLock(null, s)
    expect(s.getItem(LOCK_KEY)).toBeNull()
  })

  it('quando tranca de novo depois de sair do app', () => {
    const t0 = 1_000_000
    expect(shouldRelock(t0, t0 + 1, 0)).toBe(true) // sempre que sair
    expect(shouldRelock(t0, t0 + 59_000, 1)).toBe(false)
    expect(shouldRelock(t0, t0 + 60_000, 1)).toBe(true)
    expect(shouldRelock(t0, t0 + 4 * 60_000, 5)).toBe(false)
    expect(shouldRelock(t0, t0 + 5 * 60_000, 5)).toBe(true)
    expect(shouldRelock(t0, t0 + 999 * 60_000, -1)).toBe(false) // só ao abrir
  })

  it('espera depois de errar o PIN: 5 erros = 30 s e dobra até 10 min', () => {
    expect(lockoutMs(0)).toBe(0)
    expect(lockoutMs(4)).toBe(0)
    expect(lockoutMs(5)).toBe(30_000)
    expect(lockoutMs(6)).toBe(60_000)
    expect(lockoutMs(7)).toBe(120_000)
    expect(lockoutMs(30)).toBe(600_000)
  })
})
