import { normalizeDebts, SETTINGS_KEY, STORAGE_KEY, walletIconKey } from '@/lib/storage'
import { newId } from '@/lib/finance/mutations'
import { receiptStore, usedReceiptIds } from '@/lib/receipts'
import { applySnapshot, BACKUP_PREV_KEY, buildSnapshot } from '@/lib/sync/snapshot'
import { STORE_EVENT } from '@/lib/store'
import type { Debt } from '@/lib/types'

// Backup em arquivo JSON, no mesmo formato do app antigo (buildBackup ~l.367, importação ~l.3560).
// Exportar: todas as chaves + configurações + fotos de comprovante em uso.
// Importar: valida, mostra o que muda, guarda cópia do que existia (BACKUP_PREV_KEY) e só então troca.

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export const LAST_EXPORT_KEY = 'barnabank_last_export'
export const BANNER_SNOOZE_KEY = 'barnabank_backup_banner_snooze'

/** só estas chaves de configuração entram na importação (as mesmas de DEFAULT_SETTINGS do antigo) */
const SETTINGS_KEYS = [
  'currency', 'dateFormat', 'confirmDelete', 'backupReminder', 'defaultRate', 'defaultLateFee', 'defaultLateInterest',
  'pixKey', 'ownerName', 'pixType', 'ownerCity', 'defaultWalletId',
]

function store(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function readRaw(): Raw {
  try {
    const v: unknown = JSON.parse(store()?.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(v)) return { debts: v }
    return isObj(v) ? v : {}
  } catch {
    return {}
  }
}

export const backupFileName = (today: string) => `barnabank-backup-${today}.json`

/** o conteúdo do arquivo de backup (com as fotos de comprovante que algum pagamento usa) */
export async function buildBackupFile(now = new Date()): Promise<Raw> {
  const snap = buildSnapshot(now)
  const debts = Array.isArray(snap.debts) ? (snap.debts as Debt[]) : []
  let receipts: Record<string, string> = {}
  try {
    receipts = await receiptStore().exportUsed(usedReceiptIds(debts))
  } catch {
    // sem IndexedDB: o backup sai sem as fotos
  }
  return { ...snap, receipts }
}

export function markBackupDone(today: string) {
  try {
    store()?.setItem(LAST_EXPORT_KEY, today)
    store()?.removeItem(BANNER_SNOOZE_KEY)
  } catch {
    /* sem armazenamento */
  }
}

export function snoozeBackupBanner(until: string) {
  try {
    store()?.setItem(BANNER_SNOOZE_KEY, until)
  } catch {
    /* sem armazenamento */
  }
}

/** baixa o arquivo no navegador */
export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportBackup(today: string): Promise<void> {
  downloadJson(await buildBackupFile(), backupFileName(today))
  markBackupDone(today)
}

// ---------------------------------------------------------------- importação

export interface ImportLine {
  label: string
  from: number
  to: number
}

export interface ImportPlan {
  /** foto pronta para applySnapshot: o que o arquivo não traz fica como está */
  snapshot: Raw
  receipts: unknown
  lines: ImportLine[]
  /** dívidas descartadas por serem inválidas */
  skipped: number
}

export type ParseResult = { ok: true; plan: ImportPlan } | { ok: false; error: string }

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)
const validDebt = (d: Debt) => typeof d.name === 'string' && d.name.trim() !== '' && typeof d.principal === 'number' && !isNaN(d.principal) && d.principal > 0 && typeof d.date === 'string' && ISO_RE.test(d.date)

/**
 * Lê o texto do arquivo e monta o plano (nada é gravado). Mesmas regras do antigo: aceita lista de dívidas ou objeto
 * com `debts`; descarta dívidas e pagamentos inválidos; as listas que o arquivo não tem continuam como estão.
 */
export function parseBackup(text: string, current: Raw = readRaw()): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Não foi possível ler esse arquivo. Verifique se é um backup .json exportado pelo BarnaBank.' }
  }
  let rawDebts: unknown
  if (Array.isArray(data)) rawDebts = data
  else if (isObj(data) && Array.isArray(data.debts)) rawDebts = data.debts
  else return { ok: false, error: 'Esse arquivo não parece um backup do BarnaBank (não achei a lista de dívidas).' }
  const src: Raw = isObj(data) ? data : {}

  const migrated = normalizeDebts(JSON.parse(JSON.stringify(rawDebts)))
  const debts = migrated.filter(validDebt).map((d) => ({
    ...d,
    id: d.id || newId(),
    payments: (d.payments || []).filter((p) => p && typeof p.amount === 'number' && !isNaN(p.amount) && p.amount > 0 && typeof p.date === 'string'),
  }))
  const skipped = migrated.length - debts.length

  const snap: Raw = {}
  const lines: ImportLine[] = [{ label: 'Dívidas', from: len(current.debts), to: debts.length }]

  if (Array.isArray(src.wallets)) {
    const wallets = (src.wallets as Raw[]).filter((w) => isObj(w) && w.id && typeof w.name === 'string').map((w) => ({ ...w, icon: walletIconKey(w.icon) }))
    snap.wallets = wallets
    lines.push({ label: 'Carteiras', from: len(current.wallets), to: wallets.length })
  }
  if (Array.isArray(src.transactions)) {
    const txs = (src.transactions as Raw[]).filter(
      (t) => isObj(t) && typeof t.amount === 'number' && !isNaN(t.amount) && typeof t.date === 'string' &&
        (t.type === 'gasto' || t.type === 'entrada' || (t.type === 'transferencia' && typeof t.toWalletId === 'string')),
    )
    snap.transactions = txs
    lines.push({ label: 'Lançamentos', from: len(current.transactions), to: txs.length })
  }
  // grupos: os do arquivo, ou os atuais que ainda têm dívida nesta importação (linkGroups do antigo)
  const groups = Array.isArray(src.groups)
    ? (src.groups as Raw[]).filter((g) => isObj(g) && g.id && typeof g.title === 'string')
    : (Array.isArray(current.groups) ? (current.groups as Raw[]) : []).filter((g) => debts.some((d) => d.groupId === g.id))
  const groupIds = new Set(groups.map((g) => g.id))
  snap.groups = groups
  if (Array.isArray(src.groups)) lines.push({ label: 'Grupos', from: len(current.groups), to: groups.length })
  snap.debts = debts.map((d) => {
    if (d.groupId && !groupIds.has(d.groupId)) {
      const { groupId: _drop, ...rest } = d
      void _drop
      return rest
    }
    return d
  })

  for (const [key, label] of [['bills', 'Contas fixas'], ['cards', 'Cartões'], ['goals', 'Metas']] as const) {
    if (Array.isArray(src[key])) {
      snap[key] = src[key]
      lines.push({ label, from: len(current[key]), to: len(src[key]) })
    }
  }
  for (const k of ['cardPurchases', 'cardPayments', 'recurring']) if (Array.isArray(src[k])) snap[k] = src[k]
  for (const k of ['budgets', 'nudges', 'shares', 'catRules', 'invites', 'tgLog', 'contacts']) if (isObj(src[k])) snap[k] = src[k]

  if (isObj(src.settings)) {
    const s: Raw = {}
    for (const k of SETTINGS_KEYS) if (src.settings[k] !== undefined) s[k] = src.settings[k]
    snap.settings = s
  }
  return { ok: true, plan: { snapshot: snap, receipts: src.receipts, lines, skipped } }
}

/** Aplica o plano: o que o arquivo não traz fica como está. Devolve quantas fotos entraram, ou null se não gravou. */
export async function applyImport(plan: ImportPlan, current: Raw = readRaw()): Promise<number | null> {
  const merged: Raw = { ...current, ...plan.snapshot }
  const ok = applySnapshot(merged)
  if (!ok) return null
  try {
    return await receiptStore().importAll(plan.receipts)
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------- recuperar a cópia de antes da última troca

export function hasBackupPrev(): boolean {
  try {
    return !!store()?.getItem(BACKUP_PREV_KEY)
  } catch {
    return false
  }
}

/** volta os dados e as configurações ao que existia antes da última importação ou adoção da nuvem */
export function restoreBackupPrev(): boolean {
  const ls = store()
  if (!ls) return false
  try {
    const v: unknown = JSON.parse(ls.getItem(BACKUP_PREV_KEY) ?? 'null')
    if (!isObj(v)) return false
    const { data, settings } = v as { data: string | null; settings: string | null }
    if (typeof data === 'string') ls.setItem(STORAGE_KEY, data)
    else ls.removeItem(STORAGE_KEY)
    if (typeof settings === 'string') ls.setItem(SETTINGS_KEY, settings)
    ls.removeItem(BACKUP_PREV_KEY)
  } catch {
    return false
  }
  globalThis.dispatchEvent?.(new Event(STORE_EVENT))
  return true
}

// ---------------------------------------------------------------- lembrete

export interface ReminderInput {
  enabled: boolean
  debts: number
  today: string
  lastExport: string | null
  snoozeUntil: string | null
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86400000)

/** checkBackupReminder do antigo (~l.3623): avisa se nunca exportou ou se faz 14 dias ou mais */
export function backupReminder(i: ReminderInput): string | null {
  if (!i.enabled || i.debts === 0) return null
  if (i.snoozeUntil && i.snoozeUntil >= i.today) return null
  const days = i.lastExport ? daysBetween(i.lastExport, i.today) : null
  if (days === null) return 'Você ainda não fez nenhum backup dos seus dados.'
  if (days >= 14) return `Já faz ${days} dias sem backup dos seus dados.`
  return null
}

export function readReminderState(): { lastExport: string | null; snoozeUntil: string | null } {
  try {
    return { lastExport: store()?.getItem(LAST_EXPORT_KEY) ?? null, snoozeUntil: store()?.getItem(BANNER_SNOOZE_KEY) ?? null }
  } catch {
    return { lastExport: null, snoozeUntil: null }
  }
}
