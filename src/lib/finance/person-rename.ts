import type { StoreApi } from '@/lib/store'
import type { AppData } from '@/lib/types'
import { nameKey } from './people'

// Trocar o nome de uma pessoa. A pessoa é identificada pelo nome em minúsculas (nameKey), então trocar o nome
// muda o nome de TODAS as dívidas dela e leva junto o contato (telefone, etiquetas, notas) e os links de cobrança.

export const MAX_NAME = 60

export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim()

/** mensagem de erro, ou null se o nome serve */
export function nameError(s: string): string | null {
  const n = cleanName(s)
  if (!n) return 'Informe o nome.'
  if (n.length > MAX_NAME) return `O nome pode ter até ${MAX_NAME} letras.`
  return null
}

/** já existe OUTRA pessoa com esse nome (por dívida ou por contato)? */
export function nameTaken(data: Pick<AppData, 'debts' | 'contacts'>, oldKey: string, newName: string): boolean {
  const k = nameKey(cleanName(newName))
  if (!k || k === oldKey) return false
  return data.debts.some((d) => nameKey(d.name) === k) || Object.prototype.hasOwnProperty.call(data.contacts, k)
}

type Contact = Record<string, unknown>

const tagsOf = (c: Contact | undefined): string[] => (Array.isArray(c?.tags) ? (c!.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [])

/** junta dois contatos: o `keep` manda nos campos simples; etiquetas somam; notas diferentes ficam juntas */
export function mergeContacts(keep: Contact, other: Contact): Contact {
  const out: Contact = { ...other, ...keep }
  if (!keep.phone && other.phone) out.phone = other.phone
  const tags = [...new Set([...tagsOf(keep), ...tagsOf(other)])]
  if (tags.length) out.tags = tags
  const a = typeof keep.notes === 'string' ? keep.notes.trim() : ''
  const b = typeof other.notes === 'string' ? other.notes.trim() : ''
  if (a || b) out.notes = a && b && a !== b ? (a + '\n' + b).slice(0, 400) : a || b
  return out
}

/**
 * Renomeia a pessoa `oldKey` para `newName` em todas as dívidas, no contato e nos links de cobrança dela.
 * Se já existe outra pessoa com o novo nome, as duas viram uma só. Devolve a chave nova.
 */
export function renamePerson(api: StoreApi, oldKey: string, newName: string): string {
  let name = cleanName(newName)
  const newKey = nameKey(name)
  // juntando com quem já existe: usa o nome como essa pessoa já aparece, para não ficar "bia lima" e "Bia Lima"
  const same = newKey !== oldKey ? api.debts.find((d) => nameKey(d.name) === newKey) : undefined
  if (same) name = same.name
  api.debts = api.debts.map((d) => (nameKey(d.name) === oldKey ? { ...d, name } : d))
  if (newKey === oldKey) return newKey

  const old = api.contacts[oldKey]
  if (old) {
    const there = api.contacts[newKey]
    api.contacts[newKey] = there ? mergeContacts(there, old) : old
    delete api.contacts[oldKey]
  }

  const shares = api.raw.shares
  if (shares && typeof shares === 'object' && !Array.isArray(shares)) {
    const next: Record<string, unknown> = {}
    for (const [token, v] of Object.entries(shares as Record<string, unknown>)) {
      const sh = v as { type?: string; ref?: string } | null
      next[token] = sh && (sh.type === 'person' || sh.type === 'owe') && sh.ref === oldKey ? { ...sh, ref: newKey } : v
    }
    api.raw.shares = next
  }
  return newKey
}
