import { STORAGE_KEY } from '@/lib/storage'
import { STORE_EVENT } from '@/lib/store'

// Histórico de alterações com "Desfazer": cada gravação feita no app guarda só o que mudou (por item, não o JSON inteiro).
// Desfazer só vale se o que foi mexido ainda está como a alteração deixou; senão recusa, para não apagar uma mudança nova.
// Só registra o que passa por useWrite (o que você faz no app). Mudanças vindas do Telegram ou de outro aparelho não entram.

export const HISTORY_KEY = 'bbweb_history'
export const MAX_ENTRIES = 50
/** limite do texto guardado: ao passar, as entradas mais antigas saem */
const MAX_CHARS = 350_000
/** alteração com patch maior que isto (ex.: foto de perfil) entra na lista, mas sem "Desfazer" */
const MAX_PATCH_CHARS = 60_000

type Json = unknown
type Raw = Record<string, Json>

interface ItemChange {
  id: string
  before?: Json
  after?: Json
  /** posição original (para recolocar um item apagado) */
  index?: number
}
interface MapChange {
  k: string
  before?: Json
  after?: Json
}
export type KeyPatch = { t: 'list'; items: ItemChange[] } | { t: 'map'; entries: MapChange[] } | { t: 'whole'; before?: Json; after?: Json }
export type Patch = Record<string, KeyPatch>

export interface HistoryEntry {
  id: string
  /** ISO */
  at: string
  msg: string
  /** null = grande demais para desfazer */
  patch: Patch | null
  undone?: boolean
}

// ---------------------------------------------------------------- comparação

function same(a: Json, b: Json): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]))
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in (b as object) && same((a as Raw)[k], (b as Raw)[k]))
}

const isObj = (v: Json): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const isIdList = (v: Json): v is Raw[] => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string' && x.id !== '')
const uniqueIds = (l: Raw[]) => new Set(l.map((x) => x.id as string)).size === l.length

/** o que mudou entre dois JSONs do armazenamento (texto), por chave de primeiro nível */
export function diffRaw(beforeText: string | null, afterText: string): Patch | null {
  let b: Raw = {}
  let a: Raw
  try {
    if (beforeText) {
      const p: Json = JSON.parse(beforeText)
      if (isObj(p)) b = p
      else if (Array.isArray(p)) b = { debts: p }
    }
    const q: Json = JSON.parse(afterText)
    if (!isObj(q)) return null
    a = q
  } catch {
    return null
  }
  const patch: Patch = {}
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const x = b[key]
    const y = a[key]
    if (same(x, y)) continue
    if (isIdList(x ?? []) && isIdList(y ?? []) && uniqueIds((x as Raw[]) ?? []) && uniqueIds((y as Raw[]) ?? [])) {
      const lx = (x as Raw[] | undefined) ?? []
      const ly = (y as Raw[] | undefined) ?? []
      const items: ItemChange[] = []
      const byId = new Map(ly.map((it) => [it.id as string, it]))
      lx.forEach((it, index) => {
        const now = byId.get(it.id as string)
        if (!now) items.push({ id: it.id as string, before: it, index })
        else if (!same(it, now)) items.push({ id: it.id as string, before: it, after: now })
      })
      const had = new Set(lx.map((it) => it.id as string))
      for (const it of ly) if (!had.has(it.id as string)) items.push({ id: it.id as string, after: it })
      patch[key] = { t: 'list', items }
    } else if (isObj(x ?? {}) && isObj(y ?? {}) && x !== undefined && y !== undefined) {
      const entries: MapChange[] = []
      for (const k of new Set([...Object.keys(x as Raw), ...Object.keys(y as Raw)])) {
        if (!same((x as Raw)[k], (y as Raw)[k])) entries.push({ k, before: (x as Raw)[k], after: (y as Raw)[k] })
      }
      patch[key] = { t: 'map', entries }
    } else patch[key] = { t: 'whole', before: x, after: y }
  }
  return Object.keys(patch).length ? patch : null
}

// ---------------------------------------------------------------- aplicar o inverso

/** as chaves tocadas pelo patch ainda estão como a alteração deixou? */
export function canUndo(current: Raw, patch: Patch): boolean {
  for (const [key, kp] of Object.entries(patch)) {
    const cur = current[key]
    if (kp.t === 'whole') {
      if (!same(cur, kp.after)) return false
    } else if (kp.t === 'map') {
      const m = isObj(cur) ? cur : {}
      for (const e of kp.entries) if (!same(m[e.k], e.after)) return false
    } else {
      if (cur !== undefined && !isIdList(cur)) return false
      const byId = new Map(((cur as Raw[] | undefined) ?? []).map((it) => [it.id as string, it]))
      for (const it of kp.items) if (!same(byId.get(it.id), it.after)) return false
    }
  }
  return true
}

/** devolve o JSON com a alteração revertida (não confere: use canUndo antes) */
export function applyUndo(current: Raw, patch: Patch): Raw {
  const out: Raw = { ...current }
  for (const [key, kp] of Object.entries(patch)) {
    if (kp.t === 'whole') {
      if (kp.before === undefined) delete out[key]
      else out[key] = kp.before
    } else if (kp.t === 'map') {
      const m: Raw = isObj(out[key]) ? { ...(out[key] as Raw) } : {}
      for (const e of kp.entries) {
        if (e.before === undefined) delete m[e.k]
        else m[e.k] = e.before
      }
      out[key] = m
    } else {
      let list = [...(((out[key] as Raw[] | undefined) ?? []) as Raw[])]
      // primeiro troca e tira o que foi mexido ou criado; depois recoloca o que foi apagado na posição de antes
      for (const it of kp.items) {
        const i = list.findIndex((x) => x.id === it.id)
        if (it.before === undefined) {
          if (i >= 0) list = list.filter((_, j) => j !== i)
        } else if (it.after !== undefined && i >= 0) list[i] = it.before as Raw
      }
      const removed = kp.items.filter((it) => it.before !== undefined && it.after === undefined).sort((p, q) => (p.index ?? 0) - (q.index ?? 0))
      for (const it of removed) list.splice(Math.min(it.index ?? list.length, list.length), 0, it.before as Raw)
      out[key] = list
    }
  }
  return out
}

// ---------------------------------------------------------------- armazenamento

function ls(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readHistory(): HistoryEntry[] {
  try {
    const v: Json = JSON.parse(ls()?.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(v) ? (v.filter((e) => e && typeof e === 'object' && typeof (e as HistoryEntry).id === 'string') as HistoryEntry[]) : []
  } catch {
    return []
  }
}

function writeHistory(list: HistoryEntry[]) {
  let keep = list.slice(-MAX_ENTRIES)
  let text = JSON.stringify(keep)
  while (text.length > MAX_CHARS && keep.length > 1) {
    keep = keep.slice(1)
    text = JSON.stringify(keep)
  }
  try {
    ls()?.setItem(HISTORY_KEY, text)
  } catch {
    /* sem espaço: o histórico é só uma conveniência */
  }
}

let seq = 0
const newId = () => Date.now().toString(36) + (seq++).toString(36)

/** guarda uma alteração já gravada (before/after = o texto do armazenamento antes e depois). Devolve o id, ou null se nada mudou */
export function recordChange(msg: string, before: string | null, after: string, now = new Date()): string | null {
  const patch = diffRaw(before, after)
  if (!patch) return null
  const big = JSON.stringify(patch).length > MAX_PATCH_CHARS
  const e: HistoryEntry = { id: newId(), at: now.toISOString(), msg, patch: big ? null : patch }
  writeHistory([...readHistory(), e])
  return e.id
}

export function markUndone(id: string) {
  writeHistory(readHistory().map((e) => (e.id === id ? { ...e, undone: true } : e)))
}

export function clearHistory() {
  try {
    ls()?.removeItem(HISTORY_KEY)
  } catch {
    /* nada */
  }
}

export type UndoResult = 'ok' | 'changed' | 'missing' | 'big' | 'already' | 'error'

/** desfaz uma entrada do histórico; 'changed' = o que ela mexeu foi alterado depois */
export function undoEntry(id: string): UndoResult {
  const list = readHistory()
  const e = list.find((x) => x.id === id)
  if (!e) return 'missing'
  if (e.undone) return 'already'
  if (!e.patch) return 'big'
  const store = ls()
  if (!store) return 'error'
  let current: Raw
  try {
    const p: Json = JSON.parse(store.getItem(STORAGE_KEY) || '{}')
    if (!isObj(p)) return 'error'
    current = p
  } catch {
    return 'error'
  }
  if (!canUndo(current, e.patch)) return 'changed'
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(applyUndo(current, e.patch)))
  } catch {
    return 'error'
  }
  writeHistory(list.map((x) => (x.id === id ? { ...x, undone: true } : x)))
  globalThis.dispatchEvent?.(new Event(STORE_EVENT))
  return 'ok'
}
