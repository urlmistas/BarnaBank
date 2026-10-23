import type { Debt } from '@/lib/types'
import { normalizeDebts, STORAGE_KEY } from '@/lib/storage'

// Escrita no armazenamento do BarnaBank (mesma chave do app antigo, `barnabank_debts_v3`).
//
// Regra de ouro: o app novo ainda não conhece todos os campos (budgets, goals, recurring, shares, tgLog…).
// Por isso cada gravação LÊ o JSON atual, troca só o que mudou e devolve o resto intacto.
// Nunca se grava a partir dos dados em memória do app, que são uma cópia reduzida.

type Raw = Record<string, unknown>

/** avisa o DataProvider (o evento `storage` do navegador só dispara em OUTRAS abas) */
export const STORE_EVENT = 'bbweb:store'

export interface StoreApi {
  debts: Debt[]
  contacts: Record<string, Record<string, unknown>>
}

export type CommitResult = { ok: true; before: string | null; after: string } | { ok: false; error: string }

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export const contactKey = (name: string) => (name || '').trim().toLowerCase()

/**
 * Aplica `fn` sobre as dívidas e os contatos e grava. `before` é o texto anterior, usado no "Desfazer".
 * Se o JSON atual estiver corrompido, recusa em vez de sobrescrever.
 */
export function commit(fn: (api: StoreApi) => void): CommitResult {
  const ls = storage()
  if (!ls) return { ok: false, error: 'Este navegador não permite gravar dados.' }
  let before: string | null
  try {
    before = ls.getItem(STORAGE_KEY)
  } catch {
    return { ok: false, error: 'Não consegui ler os dados deste navegador.' }
  }
  let raw: Raw = {}
  if (before) {
    try {
      const parsed: unknown = JSON.parse(before)
      if (Array.isArray(parsed)) raw = { debts: parsed }
      else if (parsed && typeof parsed === 'object') raw = parsed as Raw
      else return { ok: false, error: 'Os dados salvos neste navegador estão em formato desconhecido. Nada foi alterado.' }
    } catch {
      return { ok: false, error: 'Os dados salvos neste navegador estão corrompidos. Nada foi alterado.' }
    }
  }
  const api: StoreApi = {
    debts: normalizeDebts(raw.debts),
    contacts: raw.contacts && typeof raw.contacts === 'object' && !Array.isArray(raw.contacts) ? { ...(raw.contacts as StoreApi['contacts']) } : {},
  }
  fn(api)
  raw.debts = api.debts
  raw.contacts = api.contacts
  const after = JSON.stringify(raw)
  try {
    ls.setItem(STORAGE_KEY, after)
  } catch (e) {
    const full = e instanceof Error && e.name === 'QuotaExceededError'
    return { ok: false, error: full ? 'Armazenamento cheio. Exporte um backup e libere espaço.' : 'Não consegui salvar neste navegador.' }
  }
  globalThis.dispatchEvent?.(new Event(STORE_EVENT))
  return { ok: true, before, after }
}

/**
 * volta ao texto anterior (Desfazer). `null` = não havia nada gravado.
 * Se os dados mudaram depois da gravação (outra aba, outro lançamento), não desfaz: apagaria a mudança nova.
 */
export function restore(before: string | null, after?: string): boolean {
  const ls = storage()
  if (!ls) return false
  try {
    if (after !== undefined && ls.getItem(STORAGE_KEY) !== after) return false
    if (before === null) ls.removeItem(STORAGE_KEY)
    else ls.setItem(STORAGE_KEY, before)
  } catch {
    return false
  }
  globalThis.dispatchEvent?.(new Event(STORE_EVENT))
  return true
}

export function setPhone(api: StoreApi, name: string, digits: string) {
  if (!digits) return
  const k = contactKey(name)
  api.contacts[k] = { ...(api.contacts[k] ?? {}), phone: digits }
}

export function replaceDebt(api: StoreApi, id: string, fn: (d: Debt) => Debt) {
  api.debts = api.debts.map((d) => (d.id === id ? fn(d) : d))
}
