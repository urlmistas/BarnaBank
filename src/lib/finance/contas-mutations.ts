import type { StoreApi } from '@/lib/store'
import type { Bill, Card, CardPayment, CardPurchase, ISODate, Transaction, YearMonth } from '@/lib/types'
import { round2 } from './dates'
import { newId } from './mutations'

// Escrita de Contas: contas fixas, cartões, compras e pagamento de fatura. Regras puras sobre as listas do
// StoreApi (itens crus). Portadas do app antigo: billDialog ~l.3102, payBillDialog ~l.3063, markBillPaid ~l.3077,
// cardDialog ~l.3206, purchaseDialog ~l.3240, payInvoiceDialog ~l.3278, onTransactionRemoved ~l.3309.

/** só as listas que estas regras tocam (o StoreApi inteiro serve) */
export type ContasStore = Pick<StoreApi, 'bills' | 'cards' | 'cardPurchases' | 'cardPayments' | 'transactions'>

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const YM_RE = /^\d{4}-\d{2}$/
const validDay = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// ---------------------------------------------------------------- conta fixa

export interface BillInput {
  kind: 'gasto' | 'entrada'
  name: string
  amount: number
  dueDay: number
  category: string
  /** '' = não afeta carteira */
  walletId: string
  startMonth: YearMonth
}

export function emptyBillInput(month: YearMonth, today: ISODate, walletId = ''): BillInput {
  return { kind: 'gasto', name: '', amount: 0, dueDay: Number(today.slice(8, 10)), category: '', walletId, startMonth: month }
}

export function billToInput(b: Bill): BillInput {
  return {
    kind: b.kind === 'entrada' ? 'entrada' : 'gasto', name: b.name, amount: b.amount, dueDay: b.dueDay,
    category: b.category ?? '', walletId: b.walletId ?? '', startMonth: b.startMonth ?? '',
  }
}

export function checkBillInput(i: BillInput): string | null {
  if (!i.name.trim()) return 'Dê um nome para a conta.'
  if (!(i.amount > 0) || !isFinite(i.amount)) return 'Informe o valor (pode ser um valor médio).'
  if (!validDay(i.dueDay)) return 'Informe um dia de vencimento entre 1 e 31.'
  if (i.startMonth && !YM_RE.test(i.startMonth)) return 'Informe o mês em que a conta começa.'
  return null
}

function billFields(i: BillInput, fallbackMonth: YearMonth) {
  return {
    kind: i.kind, name: i.name.trim(), amount: round2(i.amount), dueDay: i.dueDay, category: i.category.trim(),
    walletId: i.walletId, startMonth: i.startMonth || fallbackMonth,
  }
}

export function createBill(i: BillInput, fallbackMonth: YearMonth, id = 'b-' + newId()): Bill {
  return { id, ...billFields(i, fallbackMonth), active: true, paid: {} }
}

/** editar não mexe em `paid`, `active` nem em `endMonth` */
export function updateBill(b: Bill, i: BillInput, fallbackMonth: YearMonth): Bill {
  return { ...b, ...billFields(i, fallbackMonth) }
}

export function deleteBill(api: Pick<ContasStore, 'bills'>, billId: string) {
  api.bills = api.bills.filter((b) => b.id !== billId)
}

export interface BillPayInput {
  amount: number
  date: ISODate
  /** '' = só marca, sem lançar na carteira */
  walletId: string
}

export function checkBillPay(i: BillPayInput): string | null {
  if (!(i.amount > 0)) return 'Informe um valor maior que zero.'
  if (!ISO_RE.test(i.date)) return 'Informe a data.'
  return null
}

/**
 * Marca a conta como paga/recebida em `key`. Com carteira, lança a transação (auto 'bill:<id>:<mês>') e `paid[key]`
 * guarda o id dela; sem carteira, guarda 'x'. Devolve false se a conta não existe.
 */
export function markBillPaid(api: Pick<ContasStore, 'bills' | 'transactions'>, billId: string, key: YearMonth, i: BillPayInput): boolean {
  const b = api.bills.find((x) => x.id === billId)
  if (!b) return false
  let txId = 'x'
  if (i.walletId) {
    const tx: Transaction = {
      id: newId(), walletId: i.walletId, type: b.kind === 'entrada' ? 'entrada' : 'gasto', amount: round2(i.amount), date: i.date,
      category: b.category || b.name, note: b.name, auto: `bill:${b.id}:${key}`,
    }
    api.transactions.push(tx)
    txId = tx.id
  }
  api.bills = api.bills.map((x) => (x.id === billId ? { ...x, paid: { ...(x.paid || {}), [key]: txId } } : x))
  return true
}

/** desfaz a marcação e apaga a transação gerada */
export function unmarkBill(api: Pick<ContasStore, 'bills' | 'transactions'>, billId: string, key: YearMonth): boolean {
  const b = api.bills.find((x) => x.id === billId)
  const id = b?.paid?.[key]
  if (!b || !id) return false
  api.transactions = api.transactions.filter((t) => t.id !== id)
  const { [key]: _gone, ...rest } = b.paid
  void _gone
  api.bills = api.bills.map((x) => (x.id === billId ? { ...x, paid: rest } : x))
  return true
}

// ---------------------------------------------------------------- cartão

export interface CardInput {
  name: string
  limit: number
  closingDay: number
  dueDay: number
  /** '' = escolher na hora */
  walletId: string
}

export function emptyCardInput(walletId = ''): CardInput {
  return { name: '', limit: 0, closingDay: 5, dueDay: 12, walletId }
}

export function cardToInput(c: Card): CardInput {
  return { name: c.name, limit: c.limit || 0, closingDay: c.closingDay, dueDay: c.dueDay, walletId: c.walletId ?? '' }
}

export function checkCardInput(i: CardInput): string | null {
  if (!i.name.trim()) return 'Dê um nome para o cartão.'
  if (!validDay(i.closingDay) || !validDay(i.dueDay)) return 'Use dias entre 1 e 31 para fechamento e vencimento.'
  if (i.limit < 0) return 'O limite não pode ser negativo.'
  return null
}

function cardFields(i: CardInput) {
  return { name: i.name.trim(), limit: isNaN(i.limit) ? 0 : round2(i.limit), closingDay: i.closingDay, dueDay: i.dueDay, walletId: i.walletId }
}

export function createCard(i: CardInput, id = 'c-' + newId()): Card {
  return { id, ...cardFields(i) }
}

export function updateCard(c: Card, i: CardInput): Card {
  return { ...c, ...cardFields(i) }
}

/** exclui o cartão e as compras e pagamentos dele; as transações já lançadas nas carteiras continuam */
export function deleteCard(api: Pick<ContasStore, 'cards' | 'cardPurchases' | 'cardPayments'>, cardId: string) {
  api.cards = api.cards.filter((c) => c.id !== cardId)
  api.cardPurchases = api.cardPurchases.filter((p) => p.cardId !== cardId)
  api.cardPayments = api.cardPayments.filter((p) => p.cardId !== cardId)
}

// ---------------------------------------------------------------- compra

export interface PurchaseInput {
  desc: string
  amount: number
  installments: number
  date: ISODate
  category: string
}

export function emptyPurchaseInput(today: ISODate): PurchaseInput {
  return { desc: '', amount: 0, installments: 1, date: today, category: '' }
}

export function checkPurchaseInput(i: PurchaseInput): string | null {
  if (!i.desc.trim()) return 'Descreva a compra.'
  if (!(i.amount > 0) || !isFinite(i.amount)) return 'Informe o valor da compra.'
  if (!Number.isInteger(i.installments) || i.installments < 1 || i.installments > 48) return 'Use de 1 a 48 parcelas.'
  if (!ISO_RE.test(i.date)) return 'Informe a data da compra.'
  return null
}

export function createPurchase(cardId: string, i: PurchaseInput, id = 'p-' + newId()): CardPurchase {
  return { id, cardId, desc: i.desc.trim(), amount: round2(i.amount), installments: i.installments, date: i.date, category: i.category.trim() }
}

/** exclui a compra inteira (todas as parcelas) */
export function deletePurchase(api: Pick<ContasStore, 'cardPurchases'>, purchaseId: string) {
  api.cardPurchases = api.cardPurchases.filter((p) => p.id !== purchaseId)
}

// ---------------------------------------------------------------- pagar fatura

export interface InvoicePayInput {
  amount: number
  date: ISODate
  walletId: string
}

export function checkInvoicePay(i: InvoicePayInput): string | null {
  if (!(i.amount > 0)) return 'Informe o valor pago.'
  if (!ISO_RE.test(i.date)) return 'Informe a data.'
  return null
}

/**
 * Registra o pagamento da fatura `invoice`. Com carteira, lança a saída na carteira (auto 'card:<id do pagamento>')
 * e guarda o id em `txId`. Devolve o pagamento criado.
 */
export function payInvoice(api: Pick<ContasStore, 'cardPayments' | 'transactions'>, card: Card, invoice: YearMonth, i: InvoicePayInput): CardPayment {
  const pay: CardPayment & { txId?: string } = { id: 'cp-' + newId(), cardId: card.id, invoice, amount: round2(i.amount), date: i.date }
  if (i.walletId) {
    const tx: Transaction = {
      id: newId(), walletId: i.walletId, type: 'gasto', amount: round2(i.amount), date: i.date, category: 'Cartão de crédito',
      note: `Fatura ${card.name} (${MONTHS_SHORT[Number(invoice.slice(5, 7)) - 1]})`, auto: 'card:' + pay.id,
    }
    api.transactions.push(tx)
    pay.txId = tx.id
  }
  api.cardPayments.push(pay)
  return pay
}

// ---------------------------------------------------------------- vínculo com a carteira

/**
 * Apagar, na carteira, um lançamento automático desfaz o vínculo (onTransactionRemoved ~l.3309): a conta volta a
 * "aberta" ou o pagamento da fatura some. Chame ANTES de remover a transação. Devolve o que foi desvinculado
 * (ou null) para `relinkTransaction`, usado pelo Desfazer.
 */
export type Unlinked = { bill: Bill; key: YearMonth } | { pay: CardPayment; idx: number } | null

export function unlinkTransaction(api: Pick<ContasStore, 'bills' | 'cardPayments'>, tx: Pick<Transaction, 'id' | 'auto'>): Unlinked {
  if (!tx.auto) return null
  const b = /^bill:([^:]+):(\d{4}-\d{2})$/.exec(tx.auto)
  if (b) {
    const bill = api.bills.find((x) => x.id === b[1])
    if (!bill || bill.paid?.[b[2]] !== tx.id) return null
    const { [b[2]]: _gone, ...rest } = bill.paid
    void _gone
    api.bills = api.bills.map((x) => (x.id === bill.id ? { ...x, paid: rest } : x))
    return { bill, key: b[2] }
  }
  const c = /^card:(.+)$/.exec(tx.auto)
  if (c) {
    const idx = api.cardPayments.findIndex((x) => x.id === c[1])
    if (idx === -1) return null
    const pay = api.cardPayments[idx]
    api.cardPayments = api.cardPayments.filter((_, i) => i !== idx)
    return { pay, idx }
  }
  return null
}

export function relinkTransaction(api: Pick<ContasStore, 'bills' | 'cardPayments'>, tx: Pick<Transaction, 'id'>, u: Unlinked) {
  if (!u) return
  if ('bill' in u) {
    api.bills = api.bills.map((x) => (x.id === u.bill.id ? { ...x, paid: { ...(x.paid || {}), [u.key]: tx.id } } : x))
  } else {
    const list = [...api.cardPayments]
    list.splice(Math.min(u.idx, list.length), 0, u.pay)
    api.cardPayments = list
  }
}
