import type { Contact } from '@/lib/types'
import { normTxt, sortPersonRows, type PersonRow } from './people'

// Etiquetas e notas por pessoa (contacts[nameKey]) e ordenações da lista (app.js ~l.5463 e ~l.2091).

export const TAG_SUGGESTIONS = ['Paga em dia', 'Atrasa', 'Prefere PIX', 'Paga em dinheiro', 'Família', 'Trabalho', 'Amigo']

export const tagsOf = (c: Contact | undefined): string[] => (Array.isArray(c?.tags) ? (c.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [])
export const notesOf = (c: Contact | undefined): string => (typeof c?.notes === 'string' ? c.notes : '')

/** sugestões + etiquetas já usadas por qualquer pessoa + as da pessoa, sem repetir */
export function allTags(contacts: Record<string, Contact>, mine: string[] = []): string[] {
  const all = TAG_SUGGESTIONS.slice()
  const add = (t: string) => {
    if (!all.includes(t)) all.push(t)
  }
  mine.forEach(add)
  Object.values(contacts).forEach((c) => tagsOf(c).forEach(add))
  return all
}

/** contato novo com etiquetas e notas trocadas; o resto (telefone etc.) fica */
export function withTagsNotes(c: Contact | undefined, tags: string[], notes: string): Contact {
  const out: Contact = { ...(c ?? { phone: '' }) }
  const clean = [...new Set(tags.map((t) => t.trim().slice(0, 24)).filter(Boolean))]
  out.tags = clean
  out.notes = notes.trim().slice(0, 400)
  return out
}

export type PeopleSort = 'due' | 'recent' | 'oldest' | 'valueDesc' | 'valueAsc' | 'name'
export const PEOPLE_SORTS: PeopleSort[] = ['due', 'recent', 'oldest', 'valueDesc', 'valueAsc', 'name']
export const SORT_LABEL: Record<PeopleSort, string> = {
  due: 'Vence primeiro',
  recent: 'Mais recentes',
  oldest: 'Mais antigas',
  valueDesc: 'Maior valor',
  valueAsc: 'Menor valor',
  name: 'Nome (A–Z)',
}

/** ordena as linhas já filtradas; 'due' é a ordem padrão (atrasados, próximo vencimento, maior valor) */
export function sortPeople(rows: PersonRow[], sort: PeopleSort): PersonRow[] {
  if (sort === 'due') return sortPersonRows(rows)
  const amount = (r: PersonRow) => Math.abs(r.net)
  const byName = (a: PersonRow, b: PersonRow) => normTxt(a.name).localeCompare(normTxt(b.name), 'pt-BR')
  return rows.slice().sort((a, b) => {
    if (sort === 'valueDesc') return amount(b) - amount(a) || byName(a, b)
    if (sort === 'valueAsc') return amount(a) - amount(b) || byName(a, b)
    if (sort === 'recent') return a.recent < b.recent ? 1 : a.recent > b.recent ? -1 : byName(a, b)
    if (sort === 'oldest') return a.recent < b.recent ? -1 : a.recent > b.recent ? 1 : byName(a, b)
    return byName(a, b)
  })
}
