import { vi } from 'vitest'

/** localStorage de mentira para os testes de sincronização (ambiente node) */
export class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

export function installStorage() {
  const ls = new MemStorage()
  vi.stubGlobal('localStorage', ls)
  const events: string[] = []
  vi.stubGlobal('dispatchEvent', (e: Event) => {
    events.push(e.type)
    return true
  })
  return { ls, events }
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
