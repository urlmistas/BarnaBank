import { normalizeDebts, SETTINGS_KEY, STORAGE_KEY } from '@/lib/storage'
import { STORE_EVENT } from '@/lib/store'

// Foto dos dados deste aparelho (para enviar à nuvem) e o caminho inverso (adotar a foto da nuvem).
// Mesmo formato do backup do app antigo (buildBackup ~l.367): o JSON cru do armazenamento + `settings`.
// Campos que o app novo não conhece (budgets, goals, shares, tgLog…) passam inteiros nos dois sentidos.

type Raw = Record<string, unknown>

/** cópia do que existia antes de adotar dados da nuvem (só a mais recente), para recuperar se algo der errado */
export const BACKUP_PREV_KEY = 'bbweb_backup_prev'

const LISTS = ['debts', 'wallets', 'transactions', 'groups', 'bills', 'cards', 'cardPurchases', 'cardPayments', 'goals', 'recurring'] as const
const OBJECTS = ['contacts', 'budgets', 'nudges', 'shares', 'catRules', 'invites', 'tgLog'] as const
// fora da foto: metadados da própria foto e comprovantes (ficam no aparelho)
const META = ['app', 'version', 'exportedAt', 'settings', 'receipts']

export interface Snapshot extends Raw {
  app: 'BarnaBank'
  version: number
  exportedAt: string
  settings: Raw
}

function ls(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function read(key: string): string | null {
  try {
    return ls()?.getItem(key) ?? null
  } catch {
    return null
  }
}

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)

function parseObj(text: string | null): Raw {
  if (!text) return {}
  try {
    const v: unknown = JSON.parse(text)
    if (Array.isArray(v)) return { debts: v }
    return isObj(v) ? v : {}
  } catch {
    return {}
  }
}

/** hash curto (djb2) do texto: só para saber "mudou desde a última sincronização" */
export function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** mesmo conteúdo com as chaves em outra ordem (cada lado que grava reordena o JSON) tem o mesmo hash */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
  return v
}

/**
 * Hash do conteúdo dos dados deste aparelho, para saber "mudou desde a última sincronização".
 * Ignora a ordem das chaves e o carimbo `exportedAt`: sem isso, adotar a mesma coisa vinda da conta ou do bot
 * parecia uma mudança e os dois lados ficavam se reenviando para sempre.
 */
export function localHash(): string {
  const raw = read(STORAGE_KEY) ?? ''
  try {
    const o: unknown = JSON.parse(raw)
    if (isObj(o)) {
      const { exportedAt: _at, ...rest } = o
      void _at
      return hashStr(JSON.stringify(canonical(rest)))
    }
  } catch {
    /* texto que não é JSON: vale como está */
  }
  return hashStr(raw)
}

/** appIsEmpty do antigo (~l.5165): nada que valha a pena perder */
export function isLocalEmpty(): boolean {
  const raw = parseObj(read(STORAGE_KEY))
  const n = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : 0)
  return !(n('debts') || n('wallets') || n('transactions') || n('groups') || n('bills') || n('cards') || n('goals'))
}

/** sbHasData do antigo (~l.8403): a linha da nuvem tem alguma coisa útil? */
export function snapshotHasData(d: unknown): boolean {
  return isObj(d) && !!(d.debts || d.wallets || d.transactions || d.settings)
}

export function buildSnapshot(now = new Date()): Snapshot {
  const raw = parseObj(read(STORAGE_KEY))
  const out: Raw = { app: 'BarnaBank', version: 2, exportedAt: now.toISOString() }
  for (const k of LISTS) out[k] = Array.isArray(raw[k]) ? raw[k] : []
  for (const k of OBJECTS) out[k] = isObj(raw[k]) ? raw[k] : {}
  for (const [k, v] of Object.entries(raw)) if (!(k in out) && !META.includes(k)) out[k] = v
  out.settings = parseObj(read(SETTINGS_KEY))
  return out as Snapshot
}

/**
 * Troca os dados deste aparelho pelos de uma foto. Guarda antes o que existia (BACKUP_PREV_KEY).
 * As configurações da foto se somam às locais (chaves que só existem aqui ficam).
 * Devolve false se a foto não é válida ou se o navegador não deixou gravar (nada muda nesse caso).
 */
export function applySnapshot(snap: unknown, now = new Date()): boolean {
  const store = ls()
  if (!store || !isObj(snap)) return false
  const core: Raw = {}
  for (const [k, v] of Object.entries(snap)) if (!META.includes(k)) core[k] = v
  core.debts = normalizeDebts(snap.debts)
  const prevData = read(STORAGE_KEY)
  const prevSettings = read(SETTINGS_KEY)
  const nextSettings = isObj(snap.settings) ? { ...parseObj(prevSettings), ...snap.settings } : null
  try {
    if (prevData !== null || prevSettings !== null) {
      store.setItem(BACKUP_PREV_KEY, JSON.stringify({ at: now.toISOString(), data: prevData, settings: prevSettings }))
    }
    store.setItem(STORAGE_KEY, JSON.stringify(core))
    if (nextSettings) store.setItem(SETTINGS_KEY, JSON.stringify(nextSettings))
  } catch {
    // não deu para gravar tudo: volta ao que havia
    try {
      if (prevData === null) store.removeItem(STORAGE_KEY)
      else store.setItem(STORAGE_KEY, prevData)
    } catch {
      /* sem armazenamento */
    }
    return false
  }
  globalThis.dispatchEvent?.(new Event(STORE_EVENT))
  return true
}

/** o que `applySnapshot` guardou antes da última troca (para recuperar à mão) */
export function readBackupPrev(): { at: string; data: string | null; settings: string | null } | null {
  const raw = read(BACKUP_PREV_KEY)
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    return isObj(v) ? (v as { at: string; data: string | null; settings: string | null }) : null
  } catch {
    return null
  }
}
