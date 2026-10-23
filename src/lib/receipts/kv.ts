// Onde as fotos dos comprovantes ficam: IndexedDB `barnabank_files` / `receipts`, o mesmo banco do app antigo
// (as fotos já anexadas lá aparecem aqui). Atrás de uma interface pequena para testar sem navegador.

export interface KV {
  get(id: string): Promise<string | undefined>
  /** false = o navegador não deixou gravar */
  put(id: string, data: string): Promise<boolean>
  del(id: string): Promise<boolean>
  all(): Promise<Record<string, string>>
}

export function memoryKV(seed: Record<string, string> = {}): KV {
  const m = new Map(Object.entries(seed))
  return {
    get: async (id) => m.get(id),
    put: async (id, data) => (m.set(id, data), true),
    del: async (id) => (m.delete(id), true),
    all: async () => Object.fromEntries(m),
  }
}

const DB_NAME = 'barnabank_files'
const STORE = 'receipts'

export function idbKV(factory: IDBFactory | undefined = globalThis.indexedDB): KV {
  let dbp: Promise<IDBDatabase> | null = null
  const db = () => {
    if (!dbp) {
      dbp = new Promise<IDBDatabase>((res, rej) => {
        try {
          if (!factory) throw new Error('sem IndexedDB')
          const rq = factory.open(DB_NAME, 1)
          rq.onupgradeneeded = () => rq.result.createObjectStore(STORE)
          rq.onsuccess = () => res(rq.result)
          rq.onerror = () => rej(rq.error)
        } catch (e) {
          rej(e)
        }
      })
    }
    return dbp
  }
  /** roda `fn` numa transação e devolve o resultado; qualquer falha vira `fallback` */
  const run = async <T>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest | void, read: (rq: IDBRequest | void) => T, fallback: T) => {
    try {
      const d = await db()
      return await new Promise<T>((res) => {
        const tx = d.transaction(STORE, mode)
        const rq = fn(tx.objectStore(STORE))
        tx.oncomplete = () => res(read(rq))
        tx.onerror = () => res(fallback)
        tx.onabort = () => res(fallback)
      })
    } catch {
      return fallback
    }
  }
  return {
    get: (id) => run('readonly', (st) => st.get(id), (rq) => ((rq as IDBRequest | undefined)?.result as string | undefined), undefined),
    put: (id, data) => run('readwrite', (st) => st.put(data, id), () => true, false),
    del: (id) => run('readwrite', (st) => st.delete(id), () => true, false),
    all: async () => {
      try {
        const d = await db()
        return await new Promise<Record<string, string>>((res) => {
          const out: Record<string, string> = {}
          const rq = d.transaction(STORE).objectStore(STORE).openCursor()
          rq.onsuccess = () => {
            const c = rq.result
            if (c) {
              out[String(c.key)] = c.value as string
              c.continue()
            } else res(out)
          }
          rq.onerror = () => res(out)
        })
      } catch {
        return {}
      }
    },
  }
}
