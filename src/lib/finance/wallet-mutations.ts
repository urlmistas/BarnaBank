import type { StoreApi } from '@/lib/store'
import type { ISODate, Transaction, TransactionType, Wallet } from '@/lib/types'
import { round2 } from './dates'
import { unlinkTransaction } from './contas-mutations'
import { newId } from './mutations'

// Escrita em Carteiras: regras puras de carteira, lançamento e transferência. Não tocam no armazenamento
// (isso é de src/lib/store.ts). Portadas do app antigo: btnWalletSave ~l.4208, btnTxSave ~l.4283,
// excluir carteira ~l.4152, excluir lançamento ~l.4120 e onTransactionRemoved ~l.3309.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

// ---------------------------------------------------------------- carteira

export function checkWallet(name: string): string | null {
  return name.trim() ? null : 'Informe um nome.'
}

export function createWallet(name: string, icon: string, id = newId()): Wallet {
  return { id, name: name.trim(), icon: icon.trim() || 'wallet' }
}

/** edição: troca nome e ícone e mantém qualquer outro campo da carteira */
export function updateWallet(w: Wallet, name: string, icon: string): Wallet {
  return { ...w, name: name.trim(), icon: icon.trim() || 'wallet' }
}

/**
 * Exclui a carteira (app.js ~l.4152): apaga os lançamentos que saem ou chegam nela; os pagamentos de dívida
 * continuam, só perdem o vínculo com a carteira. Bills e cartões que apontavam para ela ficam como estão (o antigo também).
 */
export function removeWallet(api: StoreApi, walletId: string) {
  api.transactions = api.transactions.filter((t) => t.walletId !== walletId && t.toWalletId !== walletId)
  api.debts = api.debts.map((d) => {
    if (!d.payments.some((p) => p.walletId === walletId)) return d
    return {
      ...d,
      payments: d.payments.map((p) => {
        if (p.walletId !== walletId) return p
        const { walletId: _w, ...rest } = p
        void _w
        return rest
      }),
    }
  })
  api.wallets = api.wallets.filter((w) => w.id !== walletId)
}

// ---------------------------------------------------------------- lançamento

export interface TxInput {
  type: TransactionType
  walletId: string
  /** só transferência */
  toWalletId: string
  amount: number
  date: ISODate
  category: string
  note: string
}

export function emptyTxInput(today: ISODate, walletId = ''): TxInput {
  return { type: 'entrada', walletId, toWalletId: '', amount: 0, date: today, category: '', note: '' }
}

export function txToInput(t: Transaction): TxInput {
  return {
    type: t.type, walletId: t.walletId, toWalletId: t.toWalletId ?? '', amount: t.amount, date: t.date,
    category: t.type === 'transferencia' ? '' : (t.category ?? ''), note: t.note ?? '',
  }
}

/** mensagem de erro do formulário, ou null (mesmas regras do btnTxSave ~l.4283) */
export function checkTx(i: TxInput, walletIds: string[]): string | null {
  const transfer = i.type === 'transferencia'
  if (!i.walletId || !walletIds.includes(i.walletId)) return 'Selecione uma carteira.'
  if (!(i.amount > 0) || !isFinite(i.amount)) return 'Informe um valor maior que zero.'
  if (!ISO_RE.test(i.date)) return 'Informe a data.'
  if (transfer && (!i.toWalletId || i.toWalletId === i.walletId || !walletIds.includes(i.toWalletId)))
    return 'Escolha uma carteira de destino diferente da de origem.'
  if (!transfer && !i.category.trim()) return 'Informe uma categoria.'
  return null
}

function txFields(i: TxInput) {
  const transfer = i.type === 'transferencia'
  const f: Omit<Transaction, 'id'> = {
    walletId: i.walletId, type: i.type, amount: round2(i.amount), date: i.date,
    category: transfer ? 'Transferência' : i.category.trim(), note: i.note.trim(),
  }
  if (transfer) f.toWalletId = i.toWalletId
  return f
}

export function createTx(i: TxInput, id = newId()): Transaction {
  return { id, ...txFields(i) }
}

/** edição: sobrescreve os campos do formulário; o que não vem dele (ex.: `auto`) fica */
export function updateTx(t: Transaction, i: TxInput): Transaction {
  const next: Transaction = { ...t, ...txFields(i) }
  if (i.type !== 'transferencia') delete next.toWalletId
  return next
}

/** "t:ID", "t:ID:out" ou "t:ID:in" (chave de um movimento de carteira) → ID do lançamento; null se for pagamento de dívida */
export function txIdFromKey(key: string): string | null {
  const m = /^t:(.+?)(?::(?:out|in))?$/.exec(key)
  return m ? m[1] : null
}

/**
 * Posição do lançamento na lista. Lançamentos antigos sem `id` aparecem na tela como "i<posição>"
 * (ver walletEvents), então o id aceita os dois.
 */
export function findTxIndex(list: Transaction[], id: string): number {
  const byId = list.findIndex((t) => t.id === id)
  if (byId >= 0) return byId
  const m = /^i(\d+)$/.exec(id)
  if (!m) return -1
  const idx = Number(m[1])
  return list[idx] && !list[idx].id ? idx : -1
}

/**
 * Exclui o lançamento e desfaz o vínculo que ele tinha (onTransactionRemoved ~l.3309), por unlinkTransaction:
 * pagamento de conta fixa (`bill:ID:AAAA-MM`) desmarca o mês; pagamento de fatura (`card:ID`) apaga o pagamento.
 * O "Desfazer" do aviso volta o armazenamento inteiro, então o vínculo volta junto (sem precisar de relinkTransaction).
 */
export function removeTx(api: StoreApi, txId: string): boolean {
  const idx = findTxIndex(api.transactions, txId)
  if (idx < 0) return false
  const tx = api.transactions[idx]
  unlinkTransaction(api, tx)
  api.transactions = api.transactions.filter((_, i) => i !== idx)
  return true
}

/** categorias já usadas, sem repetir (sugestões do campo) */
export function usedCategories(list: Transaction[]): string[] {
  const set = new Set<string>()
  for (const t of list) if (t.category && t.type !== 'transferencia') set.add(t.category)
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
