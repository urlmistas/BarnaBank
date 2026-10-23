import { afterEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from '@/lib/storage'
import { scheduleReceiptCleanup, usedIdsInStorage } from './cleanup'
import { fitSize } from './image'
import { idbKV, memoryKV } from './kv'
import { createReceiptStore, receiptIdOf, usedReceiptIds, withReceipt } from './store'

const IMG = 'data:image/jpeg;base64,AAA'

describe('createReceiptStore', () => {
  it('guarda, lê com cache e remove', async () => {
    const kv = memoryKV()
    const get = vi.spyOn(kv, 'get')
    const s = createReceiptStore(kv)
    expect(await s.put('rc-1', IMG)).toBe(true)
    expect(await s.get('rc-1')).toBe(IMG)
    expect(get).not.toHaveBeenCalled()
    await s.remove('rc-1')
    expect(await s.get('rc-1')).toBeUndefined()
  })

  it('lê do armazenamento quando não está no cache', async () => {
    const s = createReceiptStore(memoryKV({ 'rc-9': IMG }))
    expect(await s.get('rc-9')).toBe(IMG)
  })

  it('exporta só o que algum pagamento usa e ignora id sem foto', async () => {
    const s = createReceiptStore(memoryKV({ a: IMG, b: IMG + 'B' }))
    expect(await s.exportUsed(['a', 'sem-foto'])).toEqual({ a: IMG })
  })

  it('importa só data URL de imagem', async () => {
    const kv = memoryKV()
    const s = createReceiptStore(kv)
    expect(await s.importAll({ a: IMG, b: 'texto', c: 5, d: 'data:text/html,x' })).toBe(1)
    expect(await kv.all()).toEqual({ a: IMG })
    expect(await s.importAll(null)).toBe(0)
  })

  it('devolve false quando o navegador não grava, mas a foto vale na sessão', async () => {
    const kv = memoryKV()
    kv.put = async () => false
    const s = createReceiptStore(kv)
    expect(await s.put('x', IMG)).toBe(false)
    expect(await s.get('x')).toBe(IMG)
  })
})

describe('pagamento ↔ comprovante', () => {
  it('withReceipt coloca e tira o id sem mexer no resto', () => {
    const p = { date: '2026-01-01', amount: 5, mode: 'fifo' as const }
    const a = withReceipt(p, 'rc-1')
    expect(receiptIdOf(a)).toBe('rc-1')
    expect(a).toMatchObject(p)
    expect('receiptId' in withReceipt(a, undefined)).toBe(false)
  })

  it('usedReceiptIds junta os ids das dívidas', () => {
    const pays = [{ date: 'x', amount: 1 }, withReceipt({ date: 'y', amount: 1 }, 'rc-1')]
    expect([...usedReceiptIds([{ payments: pays }, { payments: [withReceipt({ date: 'z', amount: 1 }, 'rc-2')] }])].sort()).toEqual(['rc-1', 'rc-2'])
  })
})

describe('limpeza de fotos órfãs', () => {
  afterEach(() => vi.useRealTimers())
  const storageWith = (debts: unknown) => ({ getItem: (k: string) => (k === STORAGE_KEY ? JSON.stringify({ debts }) : null) })

  it('lê os ids usados direto do armazenamento (inclusive formato antigo e JSON ruim)', () => {
    expect([...usedIdsInStorage(storageWith([{ payments: [{ receiptId: 'rc-1' }] }]))]).toEqual(['rc-1'])
    expect([...usedIdsInStorage({ getItem: () => JSON.stringify([{ payments: [{ receiptId: 'rc-2' }] }]) })]).toEqual(['rc-2'])
    expect(usedIdsInStorage({ getItem: () => '{ruim' }).size).toBe(0)
    expect(usedIdsInStorage({ getItem: () => null }).size).toBe(0)
  })

  it('apaga a foto depois do prazo só se ninguém usa', async () => {
    vi.useFakeTimers()
    const kv = memoryKV({ gone: IMG, kept: IMG })
    const store = createReceiptStore(kv)
    const used = () => new Set(['kept'])
    scheduleReceiptCleanup('gone', 9000, store, used)
    scheduleReceiptCleanup('kept', 9000, store, used)
    vi.advanceTimersByTime(9001)
    await vi.runAllTimersAsync()
    expect(Object.keys(await kv.all())).toEqual(['kept'])
  })
})

describe('fitSize', () => {
  it('reduz mantendo a proporção e nunca aumenta', () => {
    expect(fitSize(2400, 1200)).toEqual({ w: 1200, h: 600 })
    expect(fitSize(600, 3000)).toEqual({ w: 240, h: 1200 })
    expect(fitSize(300, 200)).toEqual({ w: 300, h: 200 })
    expect(fitSize(0, 0)).toEqual({ w: 1, h: 1 })
  })
})

describe('idbKV', () => {
  /** IndexedDB de brinquedo: só o que o kv.ts usa */
  function fakeIDB(): IDBFactory {
    const data = new Map<string, unknown>()
    const store = {
      put: (v: unknown, k: string) => (data.set(k, v), {}),
      get: (k: string) => ({ result: data.get(k) }),
      delete: (k: string) => (data.delete(k), {}),
      openCursor: () => {
        const keys = [...data.keys()]
        let i = -1
        const rq: Record<string, unknown> = {}
        const step = () => {
          i++
          rq.result = i < keys.length ? { key: keys[i], value: data.get(keys[i]), continue: () => queueMicrotask(step) } : null
          ;(rq.onsuccess as () => void)?.()
        }
        queueMicrotask(step)
        return rq
      },
    }
    const db = {
      createObjectStore: () => store,
      transaction: () => {
        const tx: Record<string, unknown> = { objectStore: () => store }
        queueMicrotask(() => (tx.oncomplete as () => void)?.())
        return tx
      },
    }
    return {
      open: () => {
        const rq: Record<string, unknown> = { result: db }
        queueMicrotask(() => {
          ;(rq.onupgradeneeded as () => void)?.()
          ;(rq.onsuccess as () => void)?.()
        })
        return rq
      },
    } as unknown as IDBFactory
  }

  it('grava, lê, lista e apaga', async () => {
    const kv = idbKV(fakeIDB())
    expect(await kv.put('a', IMG)).toBe(true)
    expect(await kv.get('a')).toBe(IMG)
    expect(await kv.all()).toEqual({ a: IMG })
    expect(await kv.del('a')).toBe(true)
    expect(await kv.get('a')).toBeUndefined()
  })

  it('sem IndexedDB tudo falha sem estourar', async () => {
    const kv = idbKV(undefined)
    expect(await kv.put('a', IMG)).toBe(false)
    expect(await kv.get('a')).toBeUndefined()
    expect(await kv.all()).toEqual({})
  })
})
