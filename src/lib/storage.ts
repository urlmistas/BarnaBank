import type {
  AppData, Bill, Card, CardPayment, CardPurchase, Debt, Group, Settings, Transaction, Wallet,
} from '@/lib/types'
import { syncRecurringDebt } from '@/lib/finance/debts'
import { buildDemoData } from '@/lib/demo-data'
import { normalizePlan } from '@/lib/finance/plan-normalize'

// Leitor SOMENTE LEITURA dos dados do app antigo.
// Mesmas chaves e mesmo formato de app.js (STORAGE_KEY ~l.4, loadData ~l.217, saveData ~l.352).
// Este módulo NUNCA chama localStorage.setItem/removeItem nessas chaves: a normalização
// (o que o antigo chama de "migrate") acontece só na memória, sobre uma cópia.

export const STORAGE_KEY = 'barnabank_debts_v3'
export const SETTINGS_KEY = 'barnabank_settings_v1'

/** 'cloud' = baixado da conta (Supabase), só na memória — ver src/lib/cloud.ts */
export type DataSource = 'local' | 'cloud' | 'demo' | 'empty'

export interface LoadResult {
  data: AppData
  settings: Settings
  source: DataSource
}

export const DEFAULT_SETTINGS: Settings = { currency: 'BRL', dateFormat: 'dmy', ownerName: '' }

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const YM_RE = /^\d{4}-\d{2}$/
const isNum = (v: unknown): v is number => typeof v === 'number' && !isNaN(v)
const dayOf = (v: unknown) => {
  const n = parseInt(String(v), 10)
  return n >= 1 && n <= 31 ? n : 1
}
type Raw = Record<string, unknown>
const asArr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])

function safeGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function emptyData(): AppData {
  return { debts: [], contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [] }
}

/** migrateDebts (app.js ~l.159), sem efeitos colaterais */
export function normalizeDebts(arr: unknown): Debt[] {
  return asArr(arr).filter((x) => x && typeof x === 'object').map((src) => {
    const d = { ...src } as Raw
    if (!Array.isArray(d.payments)) d.payments = []
    else if ((d.payments as unknown[]).length && typeof (d.payments as unknown[])[0] === 'string') {
      // formato antigo: lista de datas, uma por parcela cheia
      const n = Math.max(1, Math.round((d.days as number) / 30))
      const instVal = ((d.principal as number) * Math.pow(1 + (d.rate as number) / 100, n)) / n
      d.payments = (d.payments as string[]).map((dt) => ({ date: dt, amount: instVal }))
    } else d.payments = (d.payments as Raw[]).map((p) => ({ ...p }))
    if (typeof d.notes !== 'string') d.notes = ''
    if (typeof d.subject === 'string' && d.subject.trim()) d.subject = d.subject.trim().slice(0, 50)
    else delete d.subject
    if (typeof d.pubNote === 'string' && d.pubNote.trim()) d.pubNote = d.pubNote.trim().slice(0, 140)
    else delete d.pubNote
    if (d.interestType !== 'simples' && d.interestType !== 'composto' && d.interestType !== 'price') d.interestType = 'composto'
    if (!isNum(d.lateFeePct) || (d.lateFeePct as number) < 0) d.lateFeePct = 0
    if (!isNum(d.lateInterestPct) || (d.lateInterestPct as number) < 0) d.lateInterestPct = 0
    if (d.kind !== 'payable') d.kind = 'receivable'
    if (!isNum(d.discount)) d.discount = 0
    const inst = d.installments as number
    if (!inst || isNaN(inst) || inst < 1) d.installments = Math.max(1, Math.round(((d.days as number) || 30) / 30))
    if (!d.days || isNaN(d.days as number)) d.days = (d.installments as number) * 30
    if (!d.dueDay) {
      const base = typeof d.date === 'string' ? parseInt(d.date.split('-')[2], 10) : 1
      d.dueDay = base || 1
    }
    if (d.firstDue && !ISO_RE.test(String(d.firstDue))) delete d.firstDue
    if (d.dueOverride) {
      if (typeof d.dueOverride !== 'object' || Array.isArray(d.dueOverride)) delete d.dueOverride
      else {
        const ov: Record<string, string> = {}
        for (const [k, v] of Object.entries(d.dueOverride as Raw)) {
          if (/^\d{1,3}$/.test(k) && ISO_RE.test(String(v))) ov[k] = String(v)
        }
        if (Object.keys(ov).length) d.dueOverride = ov
        else delete d.dueOverride
      }
    }
    if (d.groupId && typeof d.groupId !== 'string') delete d.groupId
    if (d.plan) {
      const plan = d.plan as Raw[]
      const ok = Array.isArray(plan) && plan.length > 0 && plan.length <= 600 &&
        plan.every((x) => x && isNum(x.v) && isFinite(x.v as number) && (x.v as number) >= 0 && ISO_RE.test(String(x.due || '')))
      if (ok) {
        d.plan = plan.map((x) => ({ v: Math.round((x.v as number) * 100) / 100, due: x.due }))
        d.installments = plan.length
      } else delete d.plan
    }
    if (d.reneg && !Array.isArray(d.reneg)) delete d.reneg
    if (d.recurring) {
      const ra = (d.recurring as Raw).amount
      if (d.kind === 'payable' && isNum(ra) && isFinite(ra) && ra > 0) {
        d.recurring = { amount: Math.round(ra * 100) / 100, label: String((d.recurring as Raw).label || '').slice(0, 40) }
        delete d.plan
        delete d.reneg
      } else delete d.recurring
    }
    delete d.paid
    return d as unknown as Debt
  })
}

function normalizeGroups(arr: unknown): Group[] {
  return asArr(arr).filter((g) => g && g.id && typeof g.title === 'string').map((g) => {
    const out = { ...g } as Raw
    if (out.kind !== 'payable') out.kind = 'receivable'
    if (!isNum(out.total) || (out.total as number) < 0) out.total = 0
    return out as unknown as Group
  })
}

// Ícones de carteira do antigo (WALLET_ICONS ~l.69) e emojis legados (EMOJI_TO_ICON ~l.70)
export const WALLET_ICONS = ['wallet', 'credit-card', 'landmark', 'banknote', 'piggy-bank', 'coins', 'vault', 'smartphone', 'building', 'briefcase', 'gem', 'gift', 'shopping-bag', 'house', 'car', 'plane']
const EMOJI_TO_ICON: Record<string, string> = {
  '💳': 'credit-card', '🏦': 'landmark', '🏛': 'landmark', '💵': 'banknote', '💴': 'banknote', '💶': 'banknote', '💷': 'banknote', '💸': 'banknote',
  '👛': 'wallet', '👜': 'shopping-bag', '💰': 'coins', '🪙': 'coins', '🐷': 'piggy-bank', '🐖': 'piggy-bank', '📱': 'smartphone', '🏠': 'house', '🏡': 'house',
  '🏢': 'building', '💼': 'briefcase', '💎': 'gem', '🎁': 'gift', '🛍': 'shopping-bag', '🚗': 'car', '✈': 'plane',
}

/** walletIconKey (app.js ~l.73): emoji antigo → nome do ícone; sem ícone → 'wallet'; texto livre fica. */
export function walletIconKey(icon: unknown): string {
  if (!icon) return 'wallet'
  const s = String(icon)
  if (WALLET_ICONS.includes(s)) return s
  const bare = s.replace(/️/g, '').trim()
  return EMOJI_TO_ICON[bare] || s
}

/** carteiras (loadData ~l.238): normaliza o ícone; descarta itens sem id (o antigo os mantinha) */
function normalizeWallets(arr: unknown): Wallet[] {
  return asArr(arr).filter((w) => w && w.id != null && w.id !== '').map((w) => ({
    ...w,
    id: String(w.id),
    name: typeof w.name === 'string' ? w.name : String(w.name ?? ''),
    icon: walletIconKey(w.icon),
  })) as unknown as Wallet[]
}

/** migrateFinance (app.js ~l.250) — só bills/cards/cardPurchases/cardPayments, que o Início usa */
function normalizeFinance(p: Raw) {
  const bills = asArr(p.bills).filter((b) => b && b.id && typeof b.name === 'string' && isNum(b.amount)).map((b) => ({
    ...b,
    kind: b.kind === 'entrada' ? 'entrada' : 'gasto',
    dueDay: dayOf(b.dueDay),
    paid: b.paid && typeof b.paid === 'object' ? { ...(b.paid as Record<string, string>) } : {},
  })) as unknown as Bill[]
  const cards = asArr(p.cards).filter((c) => c && c.id && typeof c.name === 'string').map((c) => ({
    ...c, closingDay: dayOf(c.closingDay), dueDay: dayOf(c.dueDay), limit: isNum(c.limit) ? c.limit : 0,
    // carteira que paga a fatura (cardDialog ~l.3224); vazio = "escolher na hora"
    walletId: typeof c.walletId === 'string' && c.walletId ? c.walletId : undefined,
  })) as unknown as Card[]
  const ids = new Set(cards.map((c) => c.id))
  const cardPurchases = asArr(p.cardPurchases).filter((x) =>
    x && x.id && ids.has(x.cardId as string) && isNum(x.amount) && (x.amount as number) > 0 && ISO_RE.test(String(x.date || '')),
  ).map((x) => ({ ...x })) as unknown as CardPurchase[]
  const cardPayments = asArr(p.cardPayments).filter((x) =>
    x && x.id && ids.has(x.cardId as string) && isNum(x.amount) && YM_RE.test(String(x.invoice || '')),
  ).map((x) => ({ ...x })) as unknown as CardPayment[]
  return { bills, cards, cardPurchases, cardPayments }
}

/** Converte o JSON cru (string do localStorage) em AppData normalizado. Puro. */
export function parseAppData(raw: string | null, today: string): AppData | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  if (Array.isArray(parsed)) return { ...emptyData(), debts: normalizeDebts(parsed).map((d) => syncRecurringDebt(d, today)) }
  const p = parsed as Raw
  const contacts = (p.contacts && typeof p.contacts === 'object' ? p.contacts : {}) as AppData['contacts']
  const wallets = normalizeWallets(p.wallets)
  const transactions = asArr(p.transactions).filter(Boolean).map((t) => ({ ...t })) as unknown as Transaction[]
  const groups = normalizeGroups(p.groups)
  const groupIds = new Set(groups.map((g) => g.id))
  // dívidas apontando para grupo que não existe mais viram individuais (linkGroups ~l.329)
  const debts = normalizeDebts(p.debts).map((d) => {
    if (d.groupId && !groupIds.has(d.groupId)) {
      const { groupId: _drop, ...rest } = d
      void _drop
      return syncRecurringDebt(rest as Debt, today)
    }
    return syncRecurringDebt(d, today)
  })
  return { debts, contacts, wallets, transactions, groups, ...normalizeFinance(p), ...normalizePlan(p) }
}

export function hasAnyData(d: AppData): boolean {
  return d.debts.length + d.wallets.length + d.transactions.length + d.bills.length + d.cards.length > 0
}

export function loadSettings(): Settings {
  const raw = safeGet(SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(raw) as Raw
    return { ...DEFAULT_SETTINGS, ...parsed } as Settings
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Carrega os dados. Ordem:
 * 1. `?dados=demo` ou `?dados=vazio` na URL força demonstração / estado vazio (para revisão).
 * 2. localStorage["barnabank_debts_v3"] existente e válido → dados reais (mesmo que vazios).
 * 3. Caso contrário → dados de demonstração (nada é gravado).
 */
export function loadAppData(today: string, search = globalThis.location?.search ?? ''): LoadResult {
  const settings = loadSettings()
  const force = new URLSearchParams(search).get('dados')
  if (force === 'vazio') return { data: emptyData(), settings, source: 'empty' }
  if (force !== 'demo') {
    const real = parseAppData(safeGet(STORAGE_KEY), today)
    if (real) return { data: real, settings, source: hasAnyData(real) ? 'local' : 'empty' }
  }
  return { data: buildDemoData(today), settings, source: 'demo' }
}
