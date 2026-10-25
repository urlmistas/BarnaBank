import type { Debt, DebtKind, Group, ISODate } from '@/lib/types'
import { addDaysISO, EPS, round2 } from './dates'
import { paidAmount, type DebtCalc } from './debts'
import { newId } from './mutations'

// Dívida em grupo (vaquinha / conta dividida). O grupo gera UMA dívida normal por participante (Debt.groupId);
// parcelas, pagamentos, atraso e carteiras continuam por pessoa e o grupo só junta a visão.
// Portado de app.js: migrateGroups ~l.300, splitEqual ~l.318, groupStats ~l.2456, saveGroup ~l.2860, excluir ~l.2985.

export interface GroupData extends Group {
  date: ISODate
  dueDate: ISODate
  splitMode: 'equal' | 'custom'
  includeMe: boolean
  myShare: number
  walletId: string
  notes: string
}

/** campos do grupo com os padrões do antigo (migrateGroups) */
export function groupData(g: Group): GroupData {
  const kind: DebtKind = g.kind === 'payable' ? 'payable' : 'receivable'
  const includeMe = kind === 'receivable' && !!g.includeMe
  const myShare = typeof g.myShare === 'number' && isFinite(g.myShare) && g.myShare >= 0 ? g.myShare : 0
  return {
    ...g,
    kind,
    total: typeof g.total === 'number' && isFinite(g.total) && g.total >= 0 ? g.total : 0,
    date: typeof g.date === 'string' ? g.date : '',
    dueDate: typeof g.dueDate === 'string' ? g.dueDate : '',
    splitMode: g.splitMode === 'custom' ? 'custom' : 'equal',
    includeMe,
    myShare: includeMe ? myShare : 0,
    walletId: typeof g.walletId === 'string' ? g.walletId : '',
    notes: typeof g.notes === 'string' ? g.notes : '',
  }
}

/** divide sem perder centavo: R$ 100 / 3 = 33,34 + 33,33 + 33,33 (os centavos que sobram vão para os primeiros) */
export function splitEqual(total: number, count: number): number[] {
  if (count < 1) return []
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / count)
  const extra = cents - base * count
  return Array.from({ length: count }, (_, i) => (base + (i < extra ? 1 : 0)) / 100)
}

export type MemberState = 'pago' | 'atrasado' | 'pendente'

export const memberState = (d: Debt, calc: DebtCalc): MemberState => {
  const s = calc.statusOf(d)
  return s === 'pago' ? 'pago' : s === 'atrasado' ? 'atrasado' : 'pendente'
}

export interface GroupStats {
  members: Debt[]
  owed: number
  paid: number
  remaining: number
  late: number
  done: number
}

export const groupMembers = (debts: Debt[], gid: string) => debts.filter((d) => d.groupId === gid)

export function groupStats(debts: Debt[], gid: string, calc: DebtCalc): GroupStats {
  const members = groupMembers(debts, gid)
  let owed = 0
  let paid = 0
  let remaining = 0
  let late = 0
  let done = 0
  for (const d of members) {
    const et = calc.effectiveTotal(d)
    owed += et
    paid += Math.min(paidAmount(d), et)
    remaining += calc.remaining(d)
    const s = memberState(d, calc)
    if (s === 'atrasado') late++
    if (s === 'pago') done++
  }
  return { members, owed: round2(owed), paid: round2(paid), remaining: round2(remaining), late, done }
}

export type GroupFilter = 'abertos' | 'atrasados' | 'quitados' | 'todos'

/** mesma lógica dos filtros de Pessoas, aplicada ao grupo */
export function groupMatches(g: GroupData, st: GroupStats, filter: GroupFilter, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q && !g.title.toLowerCase().includes(q) && !st.members.some((d) => d.name.toLowerCase().includes(q))) return false
  if (filter === 'abertos') return st.remaining > EPS || !st.members.length
  if (filter === 'quitados') return st.members.length > 0 && st.remaining <= EPS
  if (filter === 'atrasados') return st.late > 0
  return true
}

// ---------------------------------------------------------------- formulário

export interface GroupPart {
  name: string
  amount: number
  debtId: string | null
  /** já pagou algo (ou ganhou desconto): o valor dele não muda */
  locked: boolean
  paid: number
}

export interface GroupInput {
  kind: DebtKind
  title: string
  total: number
  date: ISODate
  dueDate: ISODate
  split: 'equal' | 'custom'
  includeMe: boolean
  /** minha parte (só vale com includeMe) */
  me: number
  walletId: string
  notes: string
  parts: GroupPart[]
}

export function emptyGroupInput(kind: DebtKind, today: ISODate): GroupInput {
  return {
    kind, title: '', total: 0, date: today, dueDate: addDaysISO(today, 7), split: 'equal', includeMe: kind === 'receivable', me: 0,
    walletId: '', notes: '', parts: [],
  }
}

export function groupToInput(g: GroupData, debts: Debt[]): GroupInput {
  return {
    kind: g.kind, title: g.title, total: g.total, date: g.date, dueDate: g.dueDate, split: g.splitMode, includeMe: g.includeMe, me: g.myShare,
    walletId: g.walletId, notes: g.notes,
    parts: groupMembers(debts, g.id).map((d) => ({
      name: d.name, amount: d.principal, debtId: d.id, locked: paidAmount(d) > EPS || (d.discount || 0) > EPS, paid: paidAmount(d),
    })),
  }
}

export const nameKey = (name: string) => (name || '').trim().toLowerCase()
export const MAX_PARTS = 60

/**
 * Adiciona nomes separados por vírgula, ponto e vírgula ou linha. Ignora repetidos (devolve quais) e respeita o limite.
 * `removed` guarda quem saiu nesta edição: se o nome voltar, volta com o mesmo vínculo.
 */
export function addParticipants(parts: GroupPart[], removed: GroupPart[], raw: string): { parts: GroupPart[]; removed: GroupPart[]; dupes: string[] } {
  const names = String(raw || '').split(/[,;\n]+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const dupes: string[] = []
  const nextParts = [...parts]
  const nextRemoved = [...removed]
  for (const name of names) {
    const key = nameKey(name)
    if (nextParts.some((p) => nameKey(p.name) === key)) {
      dupes.push(name)
      continue
    }
    const back = nextRemoved.findIndex((p) => nameKey(p.name) === key)
    if (back >= 0) {
      nextParts.push(nextRemoved.splice(back, 1)[0])
      continue
    }
    if (nextParts.length >= MAX_PARTS) continue
    nextParts.push({ name, amount: 0, debtId: null, locked: false, paid: 0 })
  }
  return { parts: nextParts, removed: nextRemoved, dupes }
}

export interface EqualInfo {
  rest: number
  n: number
  fixed: number
  locked: number
}

/** divisão igual: quem já pagou mantém o valor; o resto (e a minha parte) se divide entre os demais */
export function recalcEqual(input: GroupInput): { parts: GroupPart[]; me: number; eq: EqualInfo } {
  const inc = input.kind === 'receivable' && input.includeMe
  const locked = input.parts.filter((p) => p.locked)
  const free = input.parts.filter((p) => !p.locked)
  const fixed = round2(locked.reduce((s, p) => s + p.amount, 0))
  const n = free.length + (inc ? 1 : 0)
  const rest = round2((isNaN(input.total) ? 0 : input.total) - fixed)
  const eq: EqualInfo = { rest, n, fixed, locked: locked.length }
  let me = 0
  let shares: number[] = []
  if (n > 0 && rest >= 0) {
    shares = splitEqual(rest, n)
    me = inc ? shares[n - 1] : 0
  }
  let i = 0
  const parts = input.parts.map((p) => (p.locked ? p : { ...p, amount: shares.length ? shares[i++] : 0 }))
  return { parts, me, eq }
}

/** aplica a divisão igual quando o modo é "igual" */
export function withEqualSplit(input: GroupInput): GroupInput {
  if (input.split !== 'equal') return input
  const r = recalcEqual(input)
  return { ...input, parts: r.parts, me: r.me }
}

/** erro de validação do grupo (já com a divisão igual aplicada), ou null */
export function checkGroupInput(raw: GroupInput): string | null {
  const input = withEqualSplit(raw)
  if (!input.title.trim()) return 'Dê um nome ao grupo (ex: Churrasco de sábado).'
  if (!(input.total > 0)) return 'Informe o valor total.'
  if (!input.date) return 'Informe a data do grupo.'
  if (!input.dueDate) return 'Informe até quando pagar.'
  if (input.dueDate < input.date) return 'A data para pagar não pode ser antes da data do grupo.'
  if (!input.parts.length) return 'Adicione pelo menos uma pessoa.'
  const inc = input.kind === 'receivable' && input.includeMe
  if (input.split === 'equal') {
    const eq = recalcEqual(input).eq
    if (eq.rest < -EPS) return 'Quem já pagou soma mais que o total. Aumente o total.'
    if (input.parts.some((p) => !p.locked && !(p.amount > 0))) return 'O total não dá para dividir entre todo mundo.'
  } else {
    if (input.parts.some((p) => !p.locked && !(p.amount > 0))) return 'Informe o valor de cada pessoa.'
    const sum = round2(input.parts.reduce((s, p) => s + p.amount, 0) + (inc ? input.me : 0))
    const diff = round2(input.total - sum)
    if (Math.abs(diff) > EPS) return diff > 0 ? `Faltam ${diff.toFixed(2).replace('.', ',')} para fechar o total.` : `A soma passou ${(-diff).toFixed(2).replace('.', ',')} do total.`
  }
  return null
}

export interface SumNote {
  tone: 'ok' | 'warn' | 'bad' | 'info'
  text: string
}

/** a linha de conferência embaixo dos participantes ("R$ 100 ÷ 3 = ..."), com `money` do app */
export function groupSumNote(raw: GroupInput, money: (v: number) => string): SumNote {
  const input = withEqualSplit(raw)
  const inc = input.kind === 'receivable' && input.includeMe
  const sum = round2(input.parts.reduce((s, p) => s + (p.amount || 0), 0) + (inc ? input.me || 0 : 0))
  if (!input.parts.length) return { tone: 'info', text: 'Adicione pelo menos uma pessoa.' }
  if (!(input.total > 0)) return { tone: 'info', text: 'Informe o valor total para dividir.' }
  if (input.split === 'equal') {
    const eq = recalcEqual(input).eq
    if (eq.rest < -EPS) return { tone: 'bad', text: `Quem já pagou soma ${money(eq.fixed)}, mais que o total.` }
    if (eq.n === 0) return { tone: 'warn', text: 'Todo mundo já pagou: não sobrou ninguém para redividir.' }
    const sh = splitEqual(eq.rest, eq.n)
    const hi = sh[0]
    const lo = sh[eq.n - 1]
    let text = `${money(eq.rest)} ÷ ${eq.n} = ${hi === lo ? money(hi) : `${money(lo)} a ${money(hi)}`} cada`
    if (hi !== lo) text += ' (os centavos que sobram vão para os primeiros)'
    if (eq.locked) text += ' · quem já pagou mantém o valor'
    return { tone: 'ok', text }
  }
  const diff = round2(input.total - sum)
  if (Math.abs(diff) <= EPS) return { tone: 'ok', text: `Fecha certinho com o total de ${money(input.total)}.` }
  if (diff > 0) return { tone: 'warn', text: `Faltam ${money(diff)} pra fechar o total de ${money(input.total)}.` }
  return { tone: 'bad', text: `Passou ${money(-diff)} do total de ${money(input.total)}.` }
}

/** avisos ao editar: quem sai do grupo e o que acontece com a dívida dele */
export function editWarnings(
  input: GroupInput,
  removed: GroupPart[],
  origTotal: number,
  money: (v: number) => string,
): string[] {
  const payable = input.kind === 'payable'
  const lines: string[] = []
  for (const p of removed) {
    if (p.locked) {
      lines.push(
        payable
          ? `Você já pagou ${money(p.paid)} a ${p.name}: essa dívida sai do grupo e continua como individual.`
          : `${p.name} já pagou ${money(p.paid)}: a dívida dele sai do grupo e continua como individual.`,
      )
    } else lines.push(`A dívida de ${p.name} será apagada.`)
  }
  if (input.split === 'equal' && input.parts.some((p) => p.locked) && !isNaN(input.total) && Math.abs(input.total - origTotal) > EPS) {
    lines.push('O valor novo é redividido só entre quem ainda não pagou.')
  }
  return lines
}

function newGroupDebt(g: GroupData, name: string, amount: number): Debt {
  return {
    id: newId(), name, principal: amount, date: g.date, days: 30, installments: 1, rate: 0, interestType: 'composto',
    dueDay: parseInt(g.dueDate.split('-')[2], 10), firstDue: g.dueDate, payments: [], notes: '', kind: g.kind, discount: 0,
    lateFeePct: 0, lateInterestPct: 0, groupId: g.id,
  }
}

function groupFrom(input: GroupInput, id: string): GroupData {
  const inc = input.kind === 'receivable' && input.includeMe
  return {
    id, title: input.title.trim(), kind: input.kind, date: input.date, total: round2(input.total), splitMode: input.split, includeMe: inc,
    myShare: inc ? round2(input.me) : 0, dueDate: input.dueDate, walletId: input.walletId, notes: input.notes.trim(),
  }
}

export interface GroupResult {
  group: GroupData
  /** a lista de dívidas inteira, já alterada */
  debts: Debt[]
  created: number
  detached: number
  removed: number
}

/** cria o grupo e uma dívida por participante. `input` já deve ter passado por checkGroupInput */
export function createGroup(raw: GroupInput, debts: Debt[], id = 'g-' + newId()): GroupResult {
  const input = withEqualSplit(raw)
  const group = groupFrom(input, id)
  const made = input.parts.map((p) => newGroupDebt(group, p.name.trim(), p.amount))
  return { group, debts: [...debts, ...made], created: made.length, detached: 0, removed: 0 }
}

/**
 * Edita o grupo (saveGroup ~l.2890): quem saiu e já pagou vira dívida individual, quem saiu sem pagar tem a dívida apagada,
 * quem entrou ganha dívida nova. Quem já pagou mantém o valor; o prazo só muda nas dívidas ainda abertas.
 */
export function updateGroup(g: GroupData, raw: GroupInput, debts: Debt[], calc: DebtCalc): GroupResult {
  const input = withEqualSplit(raw)
  const keep = new Map<string, GroupPart>()
  for (const p of input.parts) if (p.debtId) keep.set(p.debtId, p)
  const dueDay = parseInt(input.dueDate.split('-')[2], 10)
  let detached = 0
  let removed = 0
  const out: Debt[] = []
  for (const d of debts) {
    if (d.groupId !== g.id) {
      out.push(d)
      continue
    }
    const p = keep.get(d.id)
    if (!p) {
      if (paidAmount(d) > EPS || (d.discount || 0) > EPS) {
        const { groupId: _g, ...rest } = d
        void _g
        out.push(rest as Debt)
        detached++
      } else removed++
      continue
    }
    let next = d
    if (!p.locked) next = { ...next, principal: p.amount }
    if (!calc.isPaid(next)) next = { ...next, firstDue: input.dueDate, dueDay }
    out.push(next)
  }
  const group = { ...groupFrom(input, g.id) }
  const fresh = input.parts.filter((p) => !p.debtId).map((p) => newGroupDebt(group, p.name.trim(), p.amount))
  return { group, debts: [...out, ...fresh], created: fresh.length, detached, removed }
}

/** excluir grupo: mantém as dívidas como individuais ou apaga junto */
export function deleteGroup(debts: Debt[], gid: string, keepDebts: boolean): Debt[] {
  if (keepDebts) {
    return debts.map((d) => {
      if (d.groupId !== gid) return d
      const { groupId: _g, ...rest } = d
      void _g
      return rest as Debt
    })
  }
  return debts.filter((d) => d.groupId !== gid)
}

// ---------------------------------------------------------------- cobrar pendentes

export const firstName = (name: string) => String(name).trim().split(/\s+/)[0] || name

/** "R$150,00" sem espaço, para mensagem de WhatsApp */
export const waMoney = (money: (v: number) => string, v: number) => money(v).replace(/^(-?R\$)[\s ]+/, '$1')

/** só dígitos; sem DDI assume Brasil (whatsPhone ~l.667) */
export function whatsPhone(raw: unknown): string {
  const phone = String(raw ?? '').replace(/\D/g, '')
  if (!phone) return ''
  return phone.length <= 11 ? '55' + phone : phone
}

/** texto do "Cobrar pendentes" de um grupo (groupChargeText ~l.2955) */
export function groupChargeText(
  g: GroupData,
  st: GroupStats,
  calc: DebtCalc,
  o: { money: (v: number) => string; date: (iso: ISODate) => string; pixKey?: string; link?: string },
): { text: string; pend: Debt[] } {
  const pend = st.members.filter((d) => calc.remaining(d) > EPS)
  const paid = st.members.filter((d) => memberState(d, calc) === 'pago')
  const lines = [`Oi, pessoal! Passando pra lembrar do *${g.title}* (${o.date(g.date)}).`, '', 'Faltam:']
  for (const d of pend) lines.push(`• ${d.name}: ${waMoney(o.money, calc.remaining(d))}${memberState(d, calc) === 'atrasado' ? ' (atrasado)' : ''}`)
  if (paid.length) lines.push('', `Já pagaram: ${paid.map((d) => firstName(d.name)).join(', ')} ✓`)
  if (g.dueDate) lines.push('', `Prazo: ${o.date(g.dueDate)}`)
  if (o.pixKey) lines.push(`*Pix:* ${o.pixKey}`)
  if (o.link) lines.push(`*Quem já pagou:* ${o.link}`)
  lines.push('', 'Valeu! 🙂')
  return { text: lines.join('\n'), pend }
}
