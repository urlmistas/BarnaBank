import type { Debt, DebtKind, InterestType, ISODate, Payment } from '@/lib/types'
import { daysInMonth, EPS, round2, toISO } from './dates'
import { installments, makeDebtCalc } from './debts'

// Escrita: regras puras que criam e alteram dívidas e pagamentos. Não tocam no armazenamento
// (isso é de src/lib/store.ts). Portadas do app antigo: quickPay ~l.1057, saveForm ~l.1741,
// removePayment ~l.1097, confirmSettle ~l.2417.

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export interface QuickPay {
  amount: number
  mode: 'fifo' | 'target'
  target?: number
}

/** valor do "Recebi/Paguei" em um toque: tudo o que está vencido, ou a próxima parcela (quickPayInfo ~l.1040) */
export function quickPayInfo(d: Debt, today: ISODate): QuickPay | null {
  const calc = makeDebtCalc(today)
  if (calc.isPaid(d)) return null
  const s = calc.schedule(d)
  if (s.overdue > EPS) return { amount: round2(s.overdue), mode: 'fifo' }
  if (s.firstOpen && s.firstOpen.open > EPS) return { amount: round2(s.firstOpen.open), mode: 'target', target: s.firstOpen.i }
  return null
}

export function quickPayment(d: Debt, today: ISODate, walletId?: string): Payment | null {
  const q = quickPayInfo(d, today)
  if (!q) return null
  const p: Payment = { id: newId(), date: today, amount: q.amount, mode: q.mode }
  if (q.mode === 'target') p.target = q.target
  if (walletId) p.walletId = walletId
  return p
}

export interface PartialInput {
  amount: number
  date: ISODate
  walletId?: string
  note?: string
}

export function partialPayment(input: PartialInput): Payment {
  const p: Payment = { id: newId(), date: input.date, amount: round2(input.amount), mode: 'fifo' }
  if (input.walletId) p.walletId = input.walletId
  if (input.note?.trim()) p.note = input.note.trim()
  return p
}

/** erro de validação do pagamento parcial, ou null */
export function checkPartial(d: Debt, today: ISODate, input: PartialInput): string | null {
  if (!(input.amount > 0)) return 'Informe o valor.'
  const rem = makeDebtCalc(today).remaining(d)
  if (input.amount > rem + EPS) return 'É mais do que o total em aberto.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Informe a data do pagamento.'
  return null
}

/** `idx` = posição em `d.payments` (pagamentos antigos podem não ter id) */
export function editPayment(d: Debt, idx: number, input: PartialInput): Debt {
  return {
    ...d,
    payments: d.payments.map((p, i) => {
      if (i !== idx) return p
      const next: Payment = { ...p, amount: round2(input.amount), date: input.date }
      if (next.pendingPart !== undefined && next.pendingPart > next.amount) next.pendingPart = next.amount
      if (input.walletId) next.walletId = input.walletId
      else delete next.walletId
      if (input.note?.trim()) next.note = input.note.trim()
      else delete next.note
      return next
    }),
  }
}

/**
 * Remove um pagamento. Os pagamentos de mesma data ou depois que tinham ido para uma parcela
 * adiantada voltam a cobrir a mais antiga em aberto (senão, apagar a parcela 3 deixa a 5 paga e a 3 atrasada).
 */
export function removePayment(d: Debt, idx: number): Debt {
  const gone = d.payments[idx]
  if (!gone) return d
  const payments = d.payments
    .filter((_, i) => i !== idx)
    .map((p) => {
      if (p.mode === 'target' && p.date >= gone.date) {
        const { target: _t, pendingPart: _pp, ...rest } = p
        void _t
        void _pp
        return { ...rest, mode: 'fifo' as const }
      }
      return p
    })
  return { ...d, payments }
}

/** quitação com desconto: paga `value` e perdoa o resto (confirmSettle ~l.2417) */
export function settleDebt(d: Debt, today: ISODate, input: { value: number; date: ISODate; walletId?: string; note?: string }): Debt {
  const rem = makeDebtCalc(today).remaining(d)
  const discountGiven = Math.max(0, rem - input.value)
  const payments = [...d.payments]
  if (input.value > 0) {
    const p: Payment = { id: newId(), date: input.date, amount: round2(input.value), mode: 'fifo', note: input.note?.trim() || 'Quitação com desconto' }
    if (input.walletId) p.walletId = input.walletId
    payments.push(p)
  }
  return { ...d, payments, discount: round2((d.discount || 0) + discountGiven), settledDate: input.date }
}

// ---------------------------------------------------------------- dívida

export interface DebtInput {
  kind: DebtKind
  name: string
  principal: number
  rate: number
  interestType: InterestType
  date: ISODate
  installments: number
  dueDay: number
  lateFeePct: number
  lateInterestPct: number
  notes: string
  subject: string
  pubNote: string
  recurring: boolean
  recLabel: string
  /** só dígitos; vazio = não mexe no contato */
  phone: string
}

export function emptyDebtInput(kind: DebtKind, today: ISODate): DebtInput {
  return {
    kind, name: '', principal: 0, rate: 0, interestType: 'composto', date: today, installments: 1,
    dueDay: Number(today.slice(8, 10)), lateFeePct: 0, lateInterestPct: 0, notes: '', subject: '', pubNote: '',
    recurring: false, recLabel: '', phone: '',
  }
}

export function debtToInput(d: Debt, phone = ''): DebtInput {
  return {
    kind: d.kind, name: d.name,
    principal: d.recurring ? d.recurring.amount : d.principal,
    rate: d.rate || 0, interestType: d.interestType || 'composto', date: d.date, installments: installments(d),
    dueDay: d.dueDay, lateFeePct: d.lateFeePct || 0, lateInterestPct: d.lateInterestPct || 0,
    notes: d.notes || '', subject: d.subject || '', pubNote: d.pubNote || '',
    recurring: !!d.recurring, recLabel: d.recurring?.label ?? '', phone,
  }
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** mensagem de erro do formulário, ou null (mesmas regras do saveForm ~l.1741) */
export function checkDebtInput(i: DebtInput): string | null {
  const pay = i.kind === 'payable'
  if (!i.name.trim()) return pay ? 'Informe o nome da empresa ou pessoa.' : 'Informe o nome do amigo.'
  if (!(i.principal > 0) || !isFinite(i.principal)) return 'Informe um valor válido.'
  if (!pay && (isNaN(i.rate) || i.rate < 0)) return 'Informe uma taxa de juros válida (pode ser 0 para sem juros).'
  if (isNaN(i.lateFeePct) || i.lateFeePct < 0 || i.lateFeePct > 100) return 'Multa por atraso inválida (use de 0 a 100%).'
  if (isNaN(i.lateInterestPct) || i.lateInterestPct < 0 || i.lateInterestPct > 100) return 'Juros de mora inválidos (use de 0 a 100% ao mês).'
  if (!ISO_RE.test(i.date)) return pay ? 'Informe quando a dívida começou.' : 'Informe a data do empréstimo.'
  if (!i.recurring && (!Number.isInteger(i.installments) || i.installments < 1 || i.installments > 600)) return 'Informe um número de parcelas válido.'
  if (!pay && i.phone && i.phone.length < 10) return 'Telefone incompleto: inclua o DDD (ex: 11999998888).'
  return null
}

/** taxa mensal acima disso pede confirmação (o antigo também pergunta) */
export const HIGH_RATE = 100

function fields(i: DebtInput) {
  const pay = i.kind === 'payable'
  const rec = pay && i.recurring
  const inst = rec ? 1 : i.installments
  const dueDay = i.dueDay >= 1 && i.dueDay <= 31 ? Math.floor(i.dueDay) : Number(i.date.slice(8, 10)) || 1
  return {
    name: i.name.trim(),
    principal: round2(i.principal),
    rate: pay ? 0 : i.rate,
    interestType: (pay ? 'composto' : i.interestType) as InterestType,
    date: i.date,
    days: inst * 30,
    installments: inst,
    dueDay,
    notes: i.notes.trim(),
    kind: i.kind,
    lateFeePct: i.lateFeePct,
    lateInterestPct: i.lateInterestPct,
    rec,
  }
}

export function createDebt(i: DebtInput, id = newId()): Debt {
  const { rec, ...base } = fields(i)
  const d: Debt = { id, ...base, payments: [], discount: 0 }
  if (rec) d.recurring = { amount: round2(i.principal), label: i.recLabel.trim().slice(0, 40) }
  if (i.subject.trim()) d.subject = i.subject.trim().slice(0, 50)
  if (i.pubNote.trim()) d.pubNote = i.pubNote.trim().slice(0, 140)
  return d
}

/** edição (saveForm ~l.1790): mexer em valor, parcelas, juros, data ou dia desfaz a renegociação */
export function updateDebt(d: Debt, i: DebtInput): Debt {
  const f = fields(i)
  const { rec, ...base } = f
  const next: Debt = { ...d, ...base }
  if (rec) {
    delete next.plan
    delete next.reneg
    next.recurring = { amount: round2(i.principal), label: i.recLabel.trim().slice(0, 40) }
  } else delete next.recurring
  if (d.plan && !rec) {
    const changed =
      Math.abs(f.principal - d.principal) > EPS || f.rate !== (d.rate || 0) || f.interestType !== (d.interestType || 'composto') ||
      f.date !== d.date || f.installments !== installments(d) || f.dueDay !== d.dueDay
    if (changed) delete next.plan
  }
  if (i.subject.trim()) next.subject = i.subject.trim().slice(0, 50)
  else delete next.subject
  if (i.pubNote.trim()) next.pubNote = i.pubNote.trim().slice(0, 140)
  else delete next.pubNote
  if (d.firstDue && f.dueDay !== d.dueDay) {
    const [y, m] = d.firstDue.split('-').map(Number)
    next.firstDue = toISO(new Date(y, m - 1, Math.min(f.dueDay, daysInMonth(y, m - 1))))
  }
  return next
}
