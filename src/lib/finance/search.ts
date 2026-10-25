import type { AppData, ISODate } from '@/lib/types'
import { EPS, ymOf } from './dates'
import { invoiceKeyFor } from './bills-cards'
import { billRouteId, cardRouteId } from './contas'
import { makeDebtCalc } from './debts'
import { nameKey, normTxt } from './people'
import { walletBalance } from './wallets'
import { parseMoney } from '@/lib/money-input'

// Busca geral (Ctrl+K ou "/"): pessoas, grupos, dívidas, carteiras, lançamentos, contas fixas, cartões e metas.
// Portado de gsCollect (app.js ~4912). Em vez de callbacks, cada resultado traz a rota (`to`).

export type SearchIcon = 'user' | 'users' | 'debt' | 'wallet' | 'in' | 'out' | 'transfer' | 'bill' | 'bill-in' | 'card' | 'purchase' | 'goal'

export interface SearchItem {
  icon: SearchIcon
  title: string
  sub: string
  amount?: number
  dir?: 'in' | 'out'
  to: string
}

export interface SearchSection {
  title: string
  items: SearchItem[]
  /** quantos resultados ficaram de fora (cada seção mostra no máximo `PER_SECTION`) */
  more: number
}

export const PER_SECTION = 6
/** limite do texto digitado: evita varrer a base inteira com consultas absurdas */
export const MAX_QUERY = 80

export interface SearchFmt {
  money: (v: number) => string
  date: (iso: ISODate) => string
}

/** o número digitado, quando a busca é só um valor ("45,00", "1.200") */
function queryAmount(raw: string): number {
  return /^[\d.,]+$/.test(raw) ? parseMoney(raw) : NaN
}

export function searchAll(data: AppData, rawInput: string, today: ISODate, fmt: SearchFmt): SearchSection[] {
  const raw = rawInput.trim().slice(0, MAX_QUERY)
  const q = normTxt(raw)
  if (!q) return []
  const amt = queryAmount(raw)
  const has = (...texts: unknown[]) => texts.some((t) => normTxt(t).includes(q))
  const amtIs = (v: number) => !isNaN(amt) && amt > 0 && Math.abs(v - amt) < 0.005
  const calc = makeDebtCalc(today)
  const secs: SearchSection[] = []
  const sec = (title: string, items: SearchItem[]) => {
    if (items.length) secs.push({ title, items: items.slice(0, PER_SECTION), more: Math.max(0, items.length - PER_SECTION) })
  }

  // pessoas
  const people = new Map<string, { name: string; rec: number; pay: number; n: number }>()
  for (const d of data.debts) {
    const k = nameKey(d.name)
    const p = people.get(k) ?? { name: d.name, rec: 0, pay: 0, n: 0 }
    p.n++
    if (d.kind === 'payable') p.pay += calc.remaining(d)
    else p.rec += calc.remaining(d)
    people.set(k, p)
  }
  sec(
    'Pessoas',
    [...people.entries()]
      .filter(([k, p]) => {
        const c = data.contacts[k] ?? {}
        const tags = Array.isArray(c.tags) ? (c.tags as unknown[]).join(' ') : ''
        return has(p.name, tags, c.notes)
      })
      .map(([k, p]) => ({
        icon: 'user' as const,
        title: p.name,
        sub: `${p.n === 1 ? '1 dívida' : p.n + ' dívidas'}${p.rec > EPS ? ' · te deve ' + fmt.money(p.rec) : ''}${p.pay > EPS ? ' · você deve ' + fmt.money(p.pay) : ''}`,
        to: '/pessoas/' + encodeURIComponent(k),
      })),
  )

  // grupos: abre a lista de pessoas filtrada pelo título (a tela de grupos cuida do resto)
  sec(
    'Grupos',
    data.groups
      .filter((g) => has(g.title, g.notes) || amtIs(g.total))
      .map((g) => ({
        icon: 'users' as const,
        title: g.title,
        sub: g.kind === 'payable' ? 'eu devo' : 'a receber',
        amount: g.total,
        dir: g.kind === 'payable' ? ('out' as const) : ('in' as const),
        to: '/pessoas?q=' + encodeURIComponent(g.title),
      })),
  )

  // dívidas: só acha pelas anotações ou pelo valor (o nome já aparece em Pessoas)
  sec(
    'Dívidas',
    data.debts
      .filter((d) => (has(d.notes, d.subject) && !has(d.name)) || amtIs(d.principal) || amtIs(calc.remaining(d)))
      .map((d) => ({
        icon: 'debt' as const,
        title: d.name,
        sub: `${d.kind === 'payable' ? 'eu devo' : 'me deve'} · desde ${fmt.date(d.date)}${d.subject ? ' · ' + d.subject : d.notes ? ' · ' + d.notes : ''}`,
        amount: d.principal,
        dir: d.kind === 'payable' ? ('out' as const) : ('in' as const),
        to: '/pessoas/' + encodeURIComponent(nameKey(d.name)),
      })),
  )

  sec(
    'Carteiras',
    data.wallets
      .filter((w) => has(w.name))
      .map((w) => ({ icon: 'wallet' as const, title: w.name, sub: 'saldo ' + fmt.money(walletBalance(data, w.id)), to: '/carteiras/' + encodeURIComponent(w.id) })),
  )

  const walletName = (id: string) => data.wallets.find((w) => w.id === id)?.name ?? ''
  sec(
    'Lançamentos',
    data.transactions
      .filter((t) => has(t.category, t.note) || amtIs(t.amount))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map((t) => ({
        icon: t.type === 'transferencia' ? ('transfer' as const) : t.type === 'gasto' ? ('out' as const) : ('in' as const),
        title: t.category || 'Lançamento',
        sub: `${fmt.date(t.date)} · ${walletName(t.walletId)}${t.note ? ' · ' + t.note : ''}`,
        amount: t.amount,
        dir: t.type === 'entrada' ? ('in' as const) : t.type === 'gasto' ? ('out' as const) : undefined,
        to: '/carteiras/' + encodeURIComponent(t.walletId),
      })),
  )

  const nowKey = ymOf(today)
  sec(
    'Contas fixas',
    data.bills
      .filter((b) => has(b.name, b.category) || amtIs(b.amount))
      .map((b) => ({
        icon: b.kind === 'entrada' ? ('bill-in' as const) : ('bill' as const),
        title: b.name,
        sub: `${b.kind === 'entrada' ? 'receita' : 'conta'} · todo dia ${b.dueDay}${b.category ? ' · ' + b.category : ''}`,
        amount: b.amount,
        dir: b.kind === 'entrada' ? ('in' as const) : ('out' as const),
        to: `/contas/${billRouteId(b.id)}?m=${nowKey}`,
      })),
  )

  const cardName = (id: string) => data.cards.find((c) => c.id === id)?.name ?? ''
  sec('Cartão', [
    ...data.cards
      .filter((c) => has(c.name))
      .map((c) => ({
        icon: 'card' as const,
        title: c.name,
        sub: `fecha dia ${c.closingDay} · vence dia ${c.dueDay}`,
        to: `/contas/${cardRouteId(c.id)}?m=${nowKey}`,
      })),
    ...data.cardPurchases
      .filter((p) => has(p.desc, p.category) || amtIs(p.amount))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map((p) => {
        const card = data.cards.find((c) => c.id === p.cardId)
        const n = parseInt(String(p.installments), 10) || 1
        return {
          icon: 'purchase' as const,
          title: p.desc || 'Compra',
          sub: `${cardName(p.cardId)} · ${fmt.date(p.date)}${n > 1 ? ' · ' + n + 'x' : ''}${p.category ? ' · ' + p.category : ''}`,
          amount: p.amount,
          dir: 'out' as const,
          to: card ? `/contas/${cardRouteId(card.id)}?m=${invoiceKeyFor(card, p.date)}` : '/contas',
        }
      }),
  ])

  sec(
    'Metas',
    (data.goals ?? [])
      .filter((g) => has(g.name))
      .map((g) => ({ icon: 'goal' as const, title: g.name, sub: 'meta de ' + fmt.money(g.target), to: '/' })),
  )

  return secs
}
