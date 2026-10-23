import type { AppData, Debt, DebtKind, ISODate, YearMonth } from '@/lib/types'
import { daysBetweenISO, round2, toISO, ymOf } from './dates'
import { installmentValue, installments, makeDebtCalc, paidAmount, type DebtCalc, type DebtStatus, type InstState } from './debts'
import { dashboardSummary } from './dashboard'

// Pessoas: uma linha por pessoa, detalhe da pessoa e calendário de vencimentos.
// Fontes (app.js antigo): nameKey ~l.124, initials ~l.659, debtLabel ~l.1116, buildCard ~l.1123
// (parcelas e histórico), renderStats ~l.824, renderPersonPage ~l.1929, personRows ~l.2049,
// monthEvents ~l.5620, renderChart ~l.920, normTxt ~l.4332.
// Tudo puro: `today` sempre como parâmetro.

/** chave da pessoa: o antigo agrupa dívidas pelo nome sem espaços nas pontas e em minúsculas */
export const nameKey = (name: string) => (name || '').trim().toLowerCase()

/** como o antigo, mas ignora palavras sem letra no começo ("Carlos (oficina)" → "C", não "C(") */
export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w))
  let s = parts[0] ? parts[0][0] : '?'
  if (parts.length > 1) s += parts[parts.length - 1][0]
  return s.toUpperCase()
}

/** minúsculas e sem acento, para a busca */
export const normTxt = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** rótulo da dívida dentro da página da pessoa (debtLabel ~l.1116) */
export function debtLabel(d: Debt, groupTitle: string | undefined, fmtDate: (iso: ISODate) => string): string {
  if (d.subject) return d.subject
  if (groupTitle) return groupTitle
  if (d.recurring) return d.recurring.label || 'Cobrança mensal'
  const n = installments(d)
  return (d.kind === 'payable' ? 'Dívida' : 'Empréstimo') + ' de ' + fmtDate(d.date) + (n > 1 ? ' · ' + n + 'x' : '')
}

// ---------------------------------------------------------------- lista

export type PeopleFilter = 'abertos' | 'atrasados' | 'quitados' | 'todos'
export const PEOPLE_FILTERS: PeopleFilter[] = ['abertos', 'atrasados', 'quitados', 'todos']

export interface PersonRow {
  key: string
  name: string
  debts: Debt[]
  openCount: number
  /** dívidas com status "atrasado" */
  lateDebts: number
  /** soma de parcelas vencidas em aberto (overdueCount) */
  lateInstallments: number
  /** vencimento da parcela atrasada mais antiga */
  oldestLateISO: ISODate | null
  lateAmount: number
  /** próximo vencimento entre as dívidas em aberto */
  nextDueISO: ISODate | null
  toReceive: number
  toPay: number
  /** toReceive − toPay: positivo = a pessoa me deve */
  net: number
  paidDebts: number
  /** valor recebido − pago nas dívidas quitadas */
  settledNet: number
  lastPaymentISO: ISODate | null
  /** data da dívida mais recente */
  recent: ISODate
}

export type PersonStatus =
  | { kind: 'late'; installments: number; days: number }
  | { kind: 'open'; openCount: number; nextDueISO: ISODate | null; dueInDays: number | null }
  | { kind: 'settled' }

/**
 * Agrupa as dívidas por pessoa (nameKey). Diferente do antigo, junta "Me devem" e "Eu devo"
 * na mesma linha (valor líquido) e inclui as dívidas que pertencem a grupos.
 */
export function buildPersonRows(data: AppData, today: ISODate, calc: DebtCalc = makeDebtCalc(today)): PersonRow[] {
  const by = new Map<string, { name: string; debts: Debt[] }>()
  for (const d of data.debts) {
    const k = nameKey(d.name)
    if (!k) continue
    const p = by.get(k)
    if (p) p.debts.push(d)
    else by.set(k, { name: d.name.trim(), debts: [d] })
  }
  const rows: PersonRow[] = []
  for (const [key, p] of by) {
    const open = p.debts.filter((d) => !calc.isPaid(d))
    const late = open.filter((d) => calc.statusOf(d) === 'atrasado')
    const sign = (d: Debt) => (d.kind === 'payable' ? -1 : 1)
    const toReceive = round2(open.filter((d) => d.kind !== 'payable').reduce((s, d) => s + calc.remaining(d), 0))
    const toPay = round2(open.filter((d) => d.kind === 'payable').reduce((s, d) => s + calc.remaining(d), 0))
    const lateISOs = late
      .map((d) => calc.schedule(d).insts.find((it) => it.late)?.dueISO ?? today)
      .sort()
    const dues = open
      .map((d) => calc.nextDueDate(d))
      .filter((x): x is Date => !!x)
      .map(toISO)
      .sort()
    const paid = p.debts.filter((d) => calc.isPaid(d))
    let lastPay: ISODate | null = null
    for (const d of p.debts) for (const pay of d.payments || []) if (!lastPay || pay.date > lastPay) lastPay = pay.date
    rows.push({
      key, name: p.name, debts: p.debts,
      openCount: open.length,
      lateDebts: late.length,
      lateInstallments: late.reduce((s, d) => s + calc.schedule(d).overdueCount, 0),
      oldestLateISO: lateISOs[0] ?? null,
      lateAmount: round2(late.reduce((s, d) => s + calc.overdueAmount(d), 0)),
      nextDueISO: dues[0] ?? null,
      toReceive, toPay, net: round2(toReceive - toPay),
      paidDebts: paid.length,
      settledNet: round2(paid.reduce((s, d) => s + sign(d) * paidAmount(d), 0)),
      lastPaymentISO: lastPay,
      recent: p.debts.reduce((m, d) => (d.date > m ? d.date : m), ''),
    })
  }
  return rows
}

export function personStatus(row: PersonRow, today: ISODate): PersonStatus {
  if (row.lateDebts > 0) {
    return { kind: 'late', installments: row.lateInstallments, days: Math.max(1, daysBetweenISO(row.oldestLateISO ?? today, today)) }
  }
  if (row.openCount > 0) {
    return { kind: 'open', openCount: row.openCount, nextDueISO: row.nextDueISO, dueInDays: row.nextDueISO ? daysBetweenISO(today, row.nextDueISO) : null }
  }
  return { kind: 'settled' }
}

/** mesmos critérios das pílulas do antigo (personRows ~l.2058) */
export function matchesFilter(row: PersonRow, f: PeopleFilter): boolean {
  if (f === 'abertos') return row.openCount > 0
  if (f === 'atrasados') return row.lateDebts > 0
  // quitados: quem tem alguma dívida quitada, mesmo que ainda tenha outras em aberto
  if (f === 'quitados') return row.paidDebts > 0
  return true
}

/** nome da pessoa ou assunto de alguma dívida, sem diferenciar acento/maiúscula */
export function matchesQuery(row: PersonRow, query: string): boolean {
  const q = normTxt(query.trim())
  if (!q) return true
  return normTxt(row.name).includes(q) || row.debts.some((d) => normTxt(d.subject).includes(q))
}

/** ordenação padrão do antigo ("Vence primeiro"): atrasados, próximo vencimento, maior valor */
export function sortPersonRows(rows: PersonRow[]): PersonRow[] {
  const due = (r: PersonRow) => r.nextDueISO ?? '9999'
  return rows.slice().sort((a, b) => {
    const la = a.lateDebts > 0
    const lb = b.lateDebts > 0
    if (la !== lb) return la ? -1 : 1
    if (due(a) !== due(b)) return due(a) < due(b) ? -1 : 1
    if (Math.abs(b.net) !== Math.abs(a.net)) return Math.abs(b.net) - Math.abs(a.net)
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

export function filterPeople(rows: PersonRow[], f: PeopleFilter, query: string): PersonRow[] {
  return sortPersonRows(rows.filter((r) => matchesFilter(r, f) && matchesQuery(r, query)))
}

export function filterCounts(rows: PersonRow[], query: string): Record<PeopleFilter, number> {
  const out = { abertos: 0, atrasados: 0, quitados: 0, todos: 0 }
  for (const r of rows) {
    if (!matchesQuery(r, query)) continue
    for (const f of PEOPLE_FILTERS) if (matchesFilter(r, f)) out[f]++
  }
  return out
}

export interface PeopleTotals {
  /** soma do que falta receber (igual ao "A receber" do Início) */
  toReceive: number
  /** parte de toReceive já vencida */
  late: number
  /** tudo que já entrou de pagamentos de empréstimos ("Já recebido" do antigo) */
  received: number
  /** eu devo (só para contexto) */
  toPay: number
}

export function peopleTotals(data: AppData, today: ISODate): PeopleTotals {
  const s = dashboardSummary(data, today)
  const received = data.debts.filter((d) => d.kind !== 'payable').reduce((sum, d) => sum + paidAmount(d), 0)
  return { toReceive: round2(s.toReceive), late: round2(s.toReceiveLate), received: round2(received), toPay: round2(s.toPay) }
}

// ---------------------------------------------------------------- detalhe

export interface InstView {
  i: number
  n: number
  dueISO: ISODate
  value: number
  open: number
  /** pago na parcela, incluindo encargos */
  paid: number
  pen: number
  state: InstState
  lastPayISO: ISODate | null
  /** quitada depois do vencimento / antes (só a partir da 2ª, como o antigo) */
  timing: 'late' | 'early' | null
}

export interface DebtView {
  debt: Debt
  kind: DebtKind
  label: string
  groupTitle?: string
  paid: boolean
  status: DebtStatus
  daysUntil: number | null
  remaining: number
  /** total devido com encargos e desconto (effectiveTotal) */
  total: number
  paidAmount: number
  /** 0–100 (progressPct ~l.604) */
  progress: number
  overdue: number
  overdueCount: number
  credit: number
  penaltiesCharged: number
  n: number
  instValue: number
  covered: number
  insts: InstView[]
}

export interface HistoryItem {
  key: string
  date: ISODate
  amount: number
  dir: 'in' | 'out'
  debtId: string
  /** posição do pagamento em `debt.payments` (para editar/remover) */
  index: number
  debtLabel: string
  note?: string
  walletName?: string
  /** "parcela 2" quando o pagamento escolheu a parcela */
  target?: number
}

export interface PersonDetail {
  key: string
  name: string
  since: ISODate
  debts: DebtView[]
  hasReceivable: boolean
  hasPayable: boolean
  totals: {
    lent: number
    received: number
    toReceive: number
    overdue: number
    owe: number
    paidOut: number
  }
  history: HistoryItem[]
}

export function debtView(d: Debt, calc: DebtCalc, label: string, groupTitle?: string): DebtView {
  const s = calc.schedule(d)
  const n = installments(d)
  const total = calc.effectiveTotal(d)
  const remaining = calc.remaining(d)
  const paid = Math.min(paidAmount(d), total)
  const progress = Math.max(0, Math.min(100, (paid / (paid + remaining || 1)) * 100))
  return {
    debt: d, kind: d.kind, label, groupTitle,
    paid: calc.isPaid(d), status: calc.statusOf(d), daysUntil: calc.daysUntilDue(d),
    remaining, total, paidAmount: paidAmount(d), progress,
    overdue: s.overdue, overdueCount: s.overdueCount, credit: s.credit, penaltiesCharged: s.penaltiesCharged,
    n, instValue: installmentValue(d), covered: s.insts.filter((it) => it.open === 0).length,
    insts: s.insts.map((it) => ({
      i: it.i, n, dueISO: it.dueISO, value: it.value, open: it.open, paid: it.paid + it.penPaid, pen: it.pen,
      state: it.state, lastPayISO: it.lastPayISO,
      timing:
        it.state === 'paga' && it.lastPayISO
          ? it.lastPayISO > it.dueISO ? 'late' : it.lastPayISO < it.dueISO && it.i > 0 ? 'early' : null
          : null,
    })),
  }
}

/** ordem do antigo: em aberto primeiro, recorrentes no fim, por vencimento; quitadas da mais nova */
function sortDebts(list: Debt[], calc: DebtCalc): Debt[] {
  return list.slice().sort((a, b) => {
    const pa = calc.isPaid(a)
    const pb = calc.isPaid(b)
    if (pa !== pb) return pa ? 1 : -1
    if (pa) return a.date < b.date ? 1 : a.date > b.date ? -1 : 0
    if (!!a.recurring !== !!b.recurring) return a.recurring ? 1 : -1
    const x = calc.nextDueDate(a)?.getTime() ?? Infinity
    const y = calc.nextDueDate(b)?.getTime() ?? Infinity
    return x - y
  })
}

export function personDetail(
  data: AppData,
  key: string,
  today: ISODate,
  fmtDate: (iso: ISODate) => string,
  calc: DebtCalc = makeDebtCalc(today),
): PersonDetail | null {
  const k = nameKey(key)
  const debts = data.debts.filter((d) => nameKey(d.name) === k)
  if (!debts.length) return null
  const groupTitle = (d: Debt) => (d.groupId ? data.groups.find((g) => g.id === d.groupId)?.title : undefined)
  const views = sortDebts(debts, calc).map((d) => debtView(d, calc, debtLabel(d, groupTitle(d), fmtDate), groupTitle(d)))
  const rec = views.filter((v) => v.kind !== 'payable')
  const pay = views.filter((v) => v.kind === 'payable')
  const sum = (arr: DebtView[], fn: (v: DebtView) => number) => round2(arr.reduce((s, v) => s + fn(v), 0))
  const history: HistoryItem[] = []
  for (const v of views) {
    ;(v.debt.payments || []).forEach((p, idx) => {
      history.push({
        key: v.debt.id + ':' + (p.id ?? idx), date: p.date, amount: p.amount || 0,
        dir: v.kind === 'payable' ? 'out' : 'in', debtId: v.debt.id, index: idx, debtLabel: v.label,
        note: p.note || undefined,
        walletName: p.walletId ? data.wallets.find((w) => w.id === p.walletId)?.name : undefined,
        target: p.mode === 'target' && typeof p.target === 'number' ? p.target + 1 : undefined,
      })
    })
  }
  history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return {
    key: k,
    name: debts[0].name.trim(),
    since: debts.reduce((m, d) => (d.date < m ? d.date : m), debts[0].date),
    debts: views,
    hasReceivable: rec.length > 0,
    hasPayable: pay.length > 0,
    totals: {
      lent: sum(rec, (v) => v.debt.principal),
      received: sum(rec, (v) => v.paidAmount),
      toReceive: sum(rec, (v) => (v.paid ? 0 : v.remaining)),
      // como o antigo: só dívidas com status "atrasado"
      overdue: sum(rec.filter((v) => v.status === 'atrasado'), (v) => v.overdue),
      owe: sum(pay, (v) => (v.paid ? 0 : v.remaining)),
      paidOut: sum(pay, (v) => v.paidAmount),
    },
    history,
  }
}

// ---------------------------------------------------------------- calendário da pessoa

export interface CalEvent {
  key: string
  date: ISODate
  debtId: string
  title: string
  /** "parcela 2/3" ou "parcela única" */
  sub: string
  /** paga: valor da parcela; senão: o que falta */
  amount: number
  dir: 'in' | 'out'
  done: boolean
  late: boolean
}

/** parcelas da pessoa que vencem no mês `ym` (monthEvents ~l.5620, só dívidas) */
export function personMonthEvents(detail: PersonDetail, ym: YearMonth): CalEvent[] {
  const ev: CalEvent[] = []
  for (const v of detail.debts) {
    for (const it of v.insts) {
      if (ymOf(it.dueISO) !== ym) continue
      const done = it.state === 'paga'
      ev.push({
        key: v.debt.id + ':' + it.i, date: it.dueISO, debtId: v.debt.id, title: v.label,
        sub: v.n > 1 ? `parcela ${it.i + 1}/${v.n}` : 'parcela única',
        amount: done ? it.value : it.open, dir: v.kind === 'payable' ? 'out' : 'in',
        done, late: it.state === 'atrasada',
      })
    }
  }
  return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** meses com parcelas (primeiro e último) e o mês inicial do calendário */
export function personMonthRange(detail: PersonDetail, today: ISODate): { min: YearMonth; max: YearMonth; initial: YearMonth } {
  const cur = ymOf(today)
  const all = detail.debts.flatMap((v) => v.insts.map((it) => it.dueISO)).sort()
  if (!all.length) return { min: cur, max: cur, initial: cur }
  const min = ymOf(all[0]) < cur ? ymOf(all[0]) : cur
  const max = ymOf(all[all.length - 1]) > cur ? ymOf(all[all.length - 1]) : cur
  // mês atual se tiver algo nele ou ainda houver algo em aberto; senão o do último vencimento
  const hasOpen = detail.debts.some((v) => !v.paid)
  const initial = hasOpen || all.some((iso) => ymOf(iso) === cur) ? cur : ymOf(all[all.length - 1])
  return { min, max, initial }
}

/** recebido (ou pago) acumulado ao longo do tempo (renderChart ~l.920, só desta pessoa) */
export function paymentSeries(detail: PersonDetail, dir: 'in' | 'out'): { date: ISODate; total: number }[] {
  const events = detail.history.filter((h) => h.dir === dir).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  let cum = 0
  const out: { date: ISODate; total: number }[] = []
  for (const e of events) {
    cum = round2(cum + e.amount)
    const last = out[out.length - 1]
    if (last && last.date === e.date) last.total = cum
    else out.push({ date: e.date, total: cum })
  }
  return out
}
