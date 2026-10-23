// Formato dos dados gravados pelo app antigo em localStorage["barnabank_debts_v3"].
// Fonte: app.js antigo (loadData ~l.217, migrateDebts ~l.159, migrateFinance ~l.250, saveData ~l.352).
// Só os campos que o app novo usa estão tipados com rigor; o resto fica como `unknown`.

export type ISODate = string // 'YYYY-MM-DD'
export type YearMonth = string // 'YYYY-MM'

export type DebtKind = 'receivable' | 'payable'
export type InterestType = 'simples' | 'composto' | 'price'

export interface Payment {
  id?: string
  date: ISODate
  amount: number
  /** 'target' = paga atrasados (pendingPart) e depois a parcela `target`; senão FIFO */
  mode?: 'target' | 'fifo'
  target?: number
  pendingPart?: number
  walletId?: string
  note?: string
}

export interface PlanItem {
  v: number
  due: ISODate
}

export interface Debt {
  id: string
  name: string
  kind: DebtKind
  principal: number
  rate: number
  interestType: InterestType
  installments: number
  days: number
  date: ISODate
  dueDay: number
  firstDue?: ISODate
  dueOverride?: Record<string, ISODate>
  plan?: PlanItem[]
  payments: Payment[]
  discount: number
  lateFeePct: number
  lateInterestPct: number
  settledDate?: ISODate
  groupId?: string
  recurring?: { amount: number; label: string }
  notes: string
  subject?: string
  pubNote?: string
  [k: string]: unknown
}

export interface Wallet {
  id: string
  name: string
  icon?: string
}

export type TransactionType = 'entrada' | 'gasto' | 'transferencia'

export interface Transaction {
  id: string
  walletId: string
  toWalletId?: string
  type: TransactionType
  amount: number
  date: ISODate
  category?: string
  note?: string
  auto?: string
}

export interface Group {
  id: string
  title: string
  kind: DebtKind
  total: number
  [k: string]: unknown
}

export interface Bill {
  id: string
  name: string
  amount: number
  kind: 'entrada' | 'gasto'
  dueDay: number
  active?: boolean
  startMonth?: YearMonth
  endMonth?: YearMonth
  /** mês 'YYYY-MM' → id da transação gerada, ou 'x' se marcada sem carteira */
  paid: Record<string, string>
  category?: string
  walletId?: string
}

export interface Card {
  id: string
  name: string
  closingDay: number
  dueDay: number
  limit: number
  walletId?: string
}

export interface CardPurchase {
  id: string
  cardId: string
  amount: number
  date: ISODate
  installments?: number | string
  /** descrição (purchaseDialog ~l.3263 grava `desc`) */
  desc?: string
  category?: string
  note?: string
}

export interface CardPayment {
  id: string
  cardId: string
  amount: number
  invoice: YearMonth
  date?: ISODate
}

export interface Contact {
  phone?: string
  [k: string]: unknown
}

export interface AppData {
  debts: Debt[]
  contacts: Record<string, Contact>
  wallets: Wallet[]
  transactions: Transaction[]
  groups: Group[]
  bills: Bill[]
  cards: Card[]
  cardPurchases: CardPurchase[]
  cardPayments: CardPayment[]
}

export interface Settings {
  currency: 'BRL' | 'USD' | 'EUR' | string
  dateFormat: 'dmy' | 'mdy' | 'iso' | string
  ownerName: string
  [k: string]: unknown
}
